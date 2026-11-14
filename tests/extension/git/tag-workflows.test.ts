import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTempGitRepo } from '@tests/helpers/git-repo';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { RepoKind } from '@core/git/domain/repo-context';
import { runTagCommand } from '@extension/commands/tag-commands';
import { CheckoutBranchUseCase } from '@application/usecases/branches/checkout-branch';
import { GetTagPublicationUseCase } from '@application/usecases/graph/get-tag-publication';
import { resetMockVscode, window as mockWindow } from '@tests/mocks/vscode';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import type { GraphExtensionToWebviewMessage } from '@protocol/graph/messages';
import { queryGraphLog } from '@extension/git/queries/query-graph';

describe('tag workflows against real repositories', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => { resetMockVscode(); cleanups.splice(0).forEach(cleanup => cleanup()); });

    async function fixture() {
        const repo = createTempGitRepo();
        cleanups.push(() => repo.cleanup());
        const base = repo.commitFile('version.txt', 'one\n', 'Version one');
        repo.git(['tag', 'v1', base]);
        repo.git(['tag', '-a', 'annotated', '-m', 'Annotated version', base]);
        const latest = repo.commitFile('version.txt', 'two\n', 'Version two');
        repo.git(['branch', 'v1', latest]);
        const context = { id: repo.cwd, cwd: repo.cwd, kind: RepoKind.Main, label: 'Tag fixture' };
        const runtime = new CliGitRuntime((args, target, options) => new GitCliBackend(target.cwd).run(args, options));
        const factory = new RuntimeRepositoryFactory(runtime);
        const repository = factory.createRepository(context);
        const worktree = await factory.createMainWorktree(context);
        const signal = new AbortController().signal;
        return { repo, base, latest, context, repository, worktree, signal };
    }

    it.each(['v1', 'annotated'])('checks out tag %s detached without moving a same-named branch, then returns to main', async tag => {
        const { repo, base, latest, repository, worktree, signal } = await fixture();
        expect(await runTagCommand(repository, worktree, 'checkout', tag, signal)).toBe(true);
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('');
        expect(repo.gitTrim(['rev-parse', 'refs/heads/v1'])).toBe(latest);
        await new CheckoutBranchUseCase().execute(repository, worktree, { branch: 'main', isRemote: false });
        expect(repo.gitTrim(['symbolic-ref', '--short', 'HEAD'])).toBe('main');
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
    });

    it('creates and checks out a branch from an annotated tag', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        mockWindow.inputBoxValue = 'hotfix/v1';
        expect(await runTagCommand(repository, worktree, 'newBranch', 'annotated', signal)).toBe(true);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('hotfix/v1');
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
    });

    it('leaves the repository unchanged when branch creation is cancelled', async () => {
        const { repo, latest, repository, worktree, signal } = await fixture();
        expect(await runTagCommand(repository, worktree, 'newBranch', 'v1', signal)).toBe(false);
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
    });

    it('refuses to overwrite incompatible working changes', async () => {
        const { repo, latest, repository, worktree, signal } = await fixture();
        repo.write('version.txt', 'local work\n');
        await expect(runTagCommand(repository, worktree, 'checkout', 'v1', signal)).rejects.toThrow();
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(await worktree.getWorkingTreeDiff(['version.txt'])).toContain('+local work');
    });

    it('honours cancellation before checkout', async () => {
        const { repo, latest, repository, worktree } = await fixture();
        const controller = new AbortController(); controller.abort();
        await expect(runTagCommand(repository, worktree, 'checkout', 'v1', controller.signal)).rejects.toThrow();
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
    });

    it('distinguishes local, published, conflicting and unreachable tags per remote and pushes only the selected tag', async () => {
        const { repo, base, latest, repository, worktree, signal } = await fixture();
        const remotePath = path.join(repo.cwd, 'remote.git');
        repo.git(['init', '--bare', '-q', remotePath]);
        repo.git(['remote', 'add', 'upstream', remotePath]);
        const usecase = new GetTagPublicationUseCase();
        expect(await usecase.execute(repository, ['v1'], signal)).toEqual([{ name: 'v1', remotes: [{ name: 'upstream', status: 'missing' }] }]);
        await runTagCommand(repository, worktree, 'push', 'v1', signal);
        expect(repo.gitTrim(['--git-dir', remotePath, 'show-ref', '--tags'])).toBe(`${base} refs/tags/v1`);
        expect((await usecase.execute(repository, ['v1', 'annotated'], signal)).map(tag => tag.remotes[0]?.status)).toEqual(['missing', 'same']);
        await runTagCommand(repository, worktree, 'push', 'annotated', signal);
        expect((await usecase.execute(repository, ['annotated'], signal))[0]?.remotes[0]?.status).toBe('same');
        repo.git(['tag', '-f', 'v1', latest]);
        expect((await usecase.execute(repository, ['v1'], signal))[0]?.remotes[0]?.status).toBe('different');
        await expect(runTagCommand(repository, worktree, 'push', 'v1', signal)).rejects.toThrow();
        expect(repo.gitTrim(['--git-dir', remotePath, 'rev-parse', 'refs/tags/v1'])).toBe(base);
        repo.git(['remote', 'add', 'offline', path.join(repo.cwd, 'missing.git')]);
        const unavailable = await usecase.execute(repository, ['v1'], signal);
        expect(unavailable[0]?.remotes).toContainEqual(expect.objectContaining({ name: 'offline', status: 'unavailable', error: expect.any(String) }));
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
    });

    it('returns canonical tag names and both commit and object IDs for annotated tags', async () => {
        const { repo, base, repository, signal } = await fixture();
        const tags = await repository.listTags(signal);
        expect(tags).toContainEqual({ name: 'v1', hash: base, objectHash: base });
        expect(tags).toContainEqual({ name: 'annotated', hash: base, objectHash: repo.gitTrim(['rev-parse', 'refs/tags/annotated']) });
        const backend = new GitCliBackend(repo.cwd);
        const graph = await queryGraphLog((args, abortSignal) => backend.run(args, { signal: abortSignal }), 50);
        expect(graph.find(commit => commit.hash === base)?.refs).toContain('tag: v1');
    });

    it('dismisses cancelled push feedback without reporting success', async () => {
        const { repo, context, repository, worktree } = await fixture();
        repo.git(['remote', 'add', 'first', path.join(repo.cwd, 'first.git')]);
        repo.git(['remote', 'add', 'second', path.join(repo.cwd, 'second.git')]);
        const registry = new RepositoryRegistry(); registry.registerRepository(repository); registry.registerWorktree(worktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, message => messages.push(message),
            undefined, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            await router.handle({ type: 'graph/tagCommand', command: 'push', tag: 'v1' });
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/operationDismissed' }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/operationStatus', status: 'success' }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/tagStatusInvalidated' }));
        } finally { router.dispose(); }
    });

    it('cancels remote tag checks on disposal without publishing stale results', async () => {
        const { repo, context, repository, worktree } = await fixture();
        repo.git(['remote', 'add', 'upstream', path.join(repo.cwd, 'remote.git')]);
        const check = vi.spyOn(repository, 'listRemoteTags').mockImplementation((_remote, _names, signal) => new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
        }));
        const registry = new RepositoryRegistry(); registry.registerRepository(repository); registry.registerWorktree(worktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, message => messages.push(message),
            undefined, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            const pending = router.handle({ type: 'graph/tagStatusRequest', requestId: 'check', tags: ['v1'] });
            await vi.waitFor(() => expect(check).toHaveBeenCalled());
            router.dispose(); await pending;
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/tagStatusResponse' }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/error' }));
        } finally { check.mockRestore(); router.dispose(); }
    });
});
