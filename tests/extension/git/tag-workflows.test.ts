import { TagCommand } from '@protocol/graph/messages';
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
import { resetMockVscode, setQuickPickValue, setQuickPickValues, window as mockWindow } from '@tests/mocks/vscode';
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
        expect(await runTagCommand(repository, worktree, TagCommand.Checkout, tag, signal)).toBe(true);
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
        expect(await runTagCommand(repository, worktree, TagCommand.NewBranch, 'annotated', signal)).toBe(true);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('hotfix/v1');
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
    });

    it('leaves the repository unchanged when branch creation is cancelled', async () => {
        const { repo, latest, repository, worktree, signal } = await fixture();
        expect(await runTagCommand(repository, worktree, TagCommand.NewBranch, 'v1', signal)).toBe(false);
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
    });

    it('refuses to overwrite incompatible working changes', async () => {
        const { repo, latest, repository, worktree, signal } = await fixture();
        repo.write('version.txt', 'local work\n');
        await expect(runTagCommand(repository, worktree, TagCommand.Checkout, 'v1', signal)).rejects.toThrow();
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(await worktree.getWorkingTreeDiff(['version.txt'])).toContain('+local work');
    });

    it('honours cancellation before checkout', async () => {
        const { repo, latest, repository, worktree } = await fixture();
        const controller = new AbortController(); controller.abort();
        await expect(runTagCommand(repository, worktree, TagCommand.Checkout, 'v1', controller.signal)).rejects.toThrow();
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
    });

    it('distinguishes local, published, conflicting and unreachable tags per remote and pushes only the selected tag', async () => {
        const { repo, base, latest, repository, worktree, signal } = await fixture();
        const remotePath = path.join(repo.cwd, 'remote.git');
        repo.git(['init', '--bare', '-q', remotePath]);
        repo.git(['remote', 'add', 'upstream', remotePath]);
        const usecase = new GetTagPublicationUseCase();
        expect(await usecase.execute(repository, ['v1'], signal)).toEqual([{ name: 'v1', remotes: [{ name: 'upstream', status: 'missing' }] }]);
        await runTagCommand(repository, worktree, TagCommand.Push, 'v1', signal);
        expect(repo.gitTrim(['--git-dir', remotePath, 'show-ref', '--tags'])).toBe(`${base} refs/tags/v1`);
        expect((await usecase.execute(repository, ['v1', 'annotated'], signal)).map(tag => tag.remotes[0]?.status)).toEqual(['missing', 'same']);
        await runTagCommand(repository, worktree, TagCommand.Push, 'annotated', signal);
        expect((await usecase.execute(repository, ['annotated'], signal))[0]?.remotes[0]?.status).toBe('same');
        repo.git(['tag', '-f', 'v1', latest]);
        expect((await usecase.execute(repository, ['v1'], signal))[0]?.remotes[0]?.status).toBe('different');
        await expect(runTagCommand(repository, worktree, TagCommand.Push, 'v1', signal)).rejects.toThrow();
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

    it.each(['v1', 'annotated'])('deletes only the selected local tag %s, preserving branches and other tags', async tag => {
        const { repo, latest, repository, worktree, signal } = await fixture();
        mockWindow.warningChoice = 'Delete';

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, tag, signal)).toBe(true);

        expect(() => repo.git(['rev-parse', '--verify', `refs/tags/${tag}`])).toThrow();
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(repo.gitTrim(['rev-parse', 'refs/heads/v1'])).toBe(latest);
        expect((await repository.listTags(signal)).map(item => item.name)).toEqual([tag === 'v1' ? 'annotated' : 'v1']);
        expect(mockWindow.warningMessages).toContainEqual({ message: `Delete local tag "${tag}"?`, items: ['Delete'] });
    });

    it('can delete the checked-out tag without moving detached HEAD', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        await worktree.checkout('refs/tags/v1', { detach: true }, signal);
        mockWindow.warningChoice = 'Delete';

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(true);

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('');
    });

    it('does not delete a tag when confirmation is dismissed', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(false);

        expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
    });

    it.each(['Delete Local Tag', 'Delete Remote Tag', 'Delete Local and Remote Tag'])('honors the selected deletion scope: %s', async scope => {
        const { repo, base, latest, repository, worktree, signal } = await fixture();
        const remotePath = path.join(repo.cwd, 'upstream.git');
        repo.git(['init', '--bare', '-q', remotePath]);
        repo.git(['remote', 'add', 'upstream', remotePath]);
        repo.git(['push', '-q', 'upstream', 'refs/tags/v1']);
        setQuickPickValue(scope);
        mockWindow.warningChoice = 'Delete';

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(true);

        if (scope === 'Delete Remote Tag') { expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base); }
        else { expect(() => repo.git(['rev-parse', '--verify', 'refs/tags/v1'])).toThrow(); }
        if (scope === 'Delete Local Tag') { expect(repo.gitTrim(['--git-dir', remotePath, 'rev-parse', 'refs/tags/v1'])).toBe(base); }
        else { expect(() => repo.git(['--git-dir', remotePath, 'rev-parse', '--verify', 'refs/tags/v1'])).toThrow(); }
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(latest);
        expect(repo.gitTrim(['rev-parse', 'refs/heads/v1'])).toBe(latest);
    });

    it('deletes an annotated tag only from the selected remote', async () => {
        const { repo, repository, worktree, signal } = await fixture();
        for (const name of ['upstream', 'backup']) {
            const remotePath = path.join(repo.cwd, `${name}.git`);
            repo.git(['init', '--bare', '-q', remotePath]);
            repo.git(['remote', 'add', name, remotePath]);
            repo.git(['push', '-q', name, 'refs/tags/annotated']);
        }
        const objectHash = repo.gitTrim(['rev-parse', 'refs/tags/annotated']);
        setQuickPickValues(['Delete Remote Tag', 'backup']);
        mockWindow.warningChoice = 'Delete';

        await runTagCommand(repository, worktree, TagCommand.Delete, 'annotated', signal);

        expect(repo.gitTrim(['rev-parse', 'refs/tags/annotated'])).toBe(objectHash);
        expect(repo.gitTrim(['--git-dir', path.join(repo.cwd, 'upstream.git'), 'rev-parse', 'refs/tags/annotated'])).toBe(objectHash);
        expect(() => repo.git(['--git-dir', path.join(repo.cwd, 'backup.git'), 'rev-parse', '--verify', 'refs/tags/annotated'])).toThrow();
        expect(mockWindow.warningMessages).toContainEqual({ message: 'Delete tag "annotated" from remote "backup"?', items: ['Delete'] });
    });

    it('keeps the local tag when deleting from the remote fails', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        repo.git(['remote', 'add', 'offline', path.join(repo.cwd, 'missing.git')]);
        setQuickPickValue('Delete Local and Remote Tag');
        mockWindow.warningChoice = 'Delete';

        await expect(runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
    });

    it('reports partial completion if the remote deletion succeeds but local deletion fails', async () => {
        const { repo, base, context, repository, worktree } = await fixture();
        const remotePath = path.join(repo.cwd, 'upstream.git');
        repo.git(['init', '--bare', '-q', remotePath]);
        repo.git(['remote', 'add', 'upstream', remotePath]);
        repo.git(['push', '-q', 'upstream', 'refs/tags/v1']);
        setQuickPickValue('Delete Local and Remote Tag');
        mockWindow.warningChoice = 'Delete';
        const localDelete = vi.spyOn(repository, 'deleteTag').mockRejectedValue(new Error('local deletion denied'));
        const registry = new RepositoryRegistry(); registry.registerRepository(repository); registry.registerWorktree(worktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, message => messages.push(message),
            undefined, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            await router.handle({ type: 'graph/tagCommand', command: TagCommand.Delete, tag: 'v1' });
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/tagStatusInvalidated' }));
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/error', message: expect.stringContaining('was deleted from remote "upstream", but local deletion failed') }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/operationStatus', status: 'success' }));
            expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
            expect(() => repo.git(['--git-dir', remotePath, 'rev-parse', '--verify', 'refs/tags/v1'])).toThrow();
        } finally { localDelete.mockRestore(); router.dispose(); }
    });

    it('cancels deletion without touching tags when the scope chooser is dismissed', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        repo.git(['remote', 'add', 'upstream', path.join(repo.cwd, 'remote.git')]);

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(false);

        expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
        expect(mockWindow.warningMessages).toEqual([]);
    });

    it('does not delete anything when remote selection is cancelled', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        repo.git(['remote', 'add', 'upstream', path.join(repo.cwd, 'upstream.git')]);
        repo.git(['remote', 'add', 'backup', path.join(repo.cwd, 'backup.git')]);
        setQuickPickValues(['Delete Remote Tag']);

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(false);

        expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
        expect(mockWindow.warningMessages).toEqual([]);
    });

    it('keeps local and remote tags when the final confirmation is cancelled', async () => {
        const { repo, base, repository, worktree, signal } = await fixture();
        const remotePath = path.join(repo.cwd, 'upstream.git');
        repo.git(['init', '--bare', '-q', remotePath]);
        repo.git(['remote', 'add', 'upstream', remotePath]);
        repo.git(['push', '-q', 'upstream', 'refs/tags/v1']);
        setQuickPickValue('Delete Local and Remote Tag');

        expect(await runTagCommand(repository, worktree, TagCommand.Delete, 'v1', signal)).toBe(false);

        expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
        expect(repo.gitTrim(['--git-dir', remotePath, 'rev-parse', 'refs/tags/v1'])).toBe(base);
    });

    it('honors cancellation after confirmation without deleting the tag', async () => {
        const { repo, base, repository, worktree } = await fixture();
        const controller = new AbortController();
        const warning = vi.spyOn(mockWindow, 'showWarningMessage').mockImplementation(async () => {
            controller.abort();
            return 'Delete';
        });
        try {
            await expect(runTagCommand(repository, worktree, TagCommand.Delete, 'v1', controller.signal)).rejects.toThrow();
            expect(repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(base);
        } finally { warning.mockRestore(); }
    });

    it('refreshes the graph and invalidates remote tag status after deleting a tag', async () => {
        const { context, repository, worktree } = await fixture();
        mockWindow.warningChoice = 'Delete';
        const registry = new RepositoryRegistry(); registry.registerRepository(repository); registry.registerWorktree(worktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const updated = vi.fn(async () => {});
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, message => messages.push(message),
            updated, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            await router.handle({ type: 'graph/tagCommand', command: TagCommand.Delete, tag: 'v1' });

            expect(updated).toHaveBeenCalledOnce();
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/refreshRequested' }));
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/tagStatusInvalidated' }));
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/operationStatus', command: TagCommand.Delete, status: 'success' }));
        } finally { router.dispose(); }
    });

    it('deletes in the selected repository instead of the active repository', async () => {
        const active = await fixture();
        const selected = await fixture();
        const registry = new RepositoryRegistry();
        for (const entry of [active, selected]) {
            registry.registerRepository(entry.repository);
            registry.registerWorktree(entry.worktree);
        }
        mockWindow.warningChoice = 'Delete';
        const router = new GraphMessageRouter({ currentContext: active.context, contexts: [active.context, selected.context] }, () => {},
            undefined, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            await router.handle({ type: 'graph/tagCommand', command: TagCommand.Delete, tag: 'v1', repository: {
                repoId: selected.repository.repoId, kind: selected.repository.kind, path: selected.repo.cwd,
            } });

            expect(() => selected.repo.git(['rev-parse', '--verify', 'refs/tags/v1'])).toThrow();
            expect(active.repo.gitTrim(['rev-parse', 'refs/tags/v1'])).toBe(active.base);
        } finally { router.dispose(); }
    });

    it('dismisses cancelled deletion feedback without refreshing or reporting success', async () => {
        const { context, repository, worktree } = await fixture();
        const registry = new RepositoryRegistry(); registry.registerRepository(repository); registry.registerWorktree(worktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const updated = vi.fn(async () => {});
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, message => messages.push(message),
            updated, undefined, undefined, undefined, undefined, undefined, registry);
        try {
            await router.handle({ type: 'graph/tagCommand', command: TagCommand.Delete, tag: 'v1' });

            expect(updated).not.toHaveBeenCalled();
            expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/operationDismissed' }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/operationStatus', status: 'success' }));
            expect(messages).not.toContainEqual(expect.objectContaining({ type: 'graph/tagStatusInvalidated' }));
        } finally { router.dispose(); }
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
            await router.handle({ type: 'graph/tagCommand', command: TagCommand.Push, tag: 'v1' });
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
