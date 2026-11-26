import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createRemoteWorkflowFixture, createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('Git operation options against real repositories', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

    function setup(existing?: TempGitRepo) {
        const repo = existing ?? createTempGitRepo();
        if (!existing) { cleanups.push(() => repo.cleanup()); }
        const repository = new RuntimeGitRepository({ repoId: repo.cwd, cwd: repo.cwd, gitDir: path.join(repo.cwd, '.git'), kind: 'main', label: 'Options' });
        const worktree = new RuntimeWorktree({ repoId: repo.cwd, worktreeId: repo.cwd, path: repo.cwd, gitDir: path.join(repo.cwd, '.git'), repositoryKind: 'main', isMain: true, head: 'HEAD', branch: 'main', dirty: false });
        return { repo, repository, worktree };
    }

    it('preserves merge commits and restores local changes when rebasing with the selected options', async () => {
        const { repo, worktree } = setup();
        repo.commitFile('base.txt', 'base\n', 'Base');
        repo.git(['checkout', '-qb', 'topic']);
        repo.commitFile('topic.txt', 'topic\n', 'Topic');
        repo.git(['checkout', '-qb', 'side']);
        repo.commitFile('side.txt', 'side\n', 'Side');
        repo.git(['checkout', '-q', 'topic']);
        repo.commitFile('other.txt', 'other\n', 'Other');
        repo.git(['merge', '--no-ff', '-m', 'Merge side', 'side']);
        repo.git(['checkout', '-q', 'main']);
        const target = repo.commitFile('upstream.txt', 'upstream\n', 'Upstream');
        repo.git(['checkout', '-q', 'topic']);
        repo.write('base.txt', 'uncommitted\n');

        await worktree.rebase('main', undefined, { autostash: true, rebaseMerges: true });

        expect(repo.gitTrim(['merge-base', 'main', 'topic'])).toBe(target);
        expect(repo.gitTrim(['rev-list', '--count', '--merges', 'main..topic'])).toBe('1');
        expect(fs.readFileSync(path.join(repo.cwd, 'base.txt'), 'utf8')).toBe('uncommitted\n');
        expect(repo.gitTrim(['diff', '--cached'])).toBe('');
        expect(repo.gitTrim(['stash', 'list'])).toBe('');
    });

    it('overrides configured autostash when the caller explicitly disables it', async () => {
        const { repo, worktree } = setup();
        repo.commitFile('base.txt', 'base\n', 'Base');
        repo.git(['config', 'rebase.autoStash', 'true']);
        repo.write('base.txt', 'uncommitted\n');

        await expect(worktree.rebase('main', undefined, { autostash: false, rebaseMerges: false })).rejects.toThrow();
        expect(fs.readFileSync(path.join(repo.cwd, 'base.txt'), 'utf8')).toBe('uncommitted\n');
        expect(repo.gitTrim(['config', 'rebase.autoStash'])).toBe('true');
    });

    it('honors onto, interactive autosquash and the supplied editor environment', async () => {
        const { repo, worktree } = setup();
        const base = repo.commitFile('base.txt', 'base\n', 'Base');
        const target = repo.commitFile('target.txt', 'target\n', 'Target');
        repo.git(['checkout', '-qb', 'topic', base]);
        repo.commitFile('feature.txt', 'feature\n', 'Feature');
        repo.commitFile('feature.txt', 'fixed feature\n', 'fixup! Feature');

        await worktree.rebase(base, undefined, { onto: target, interactive: true, autosquash: true, editorEnv: { GIT_SEQUENCE_EDITOR: 'true', GIT_EDITOR: 'true' } });

        expect(repo.gitTrim(['rev-parse', 'HEAD^'])).toBe(target);
        expect(repo.gitTrim(['log', '-1', '--format=%s'])).toBe('Feature');
        expect(fs.readFileSync(path.join(repo.cwd, 'feature.txt'), 'utf8')).toBe('fixed feature\n');
    });

    it.each([false, true])('pushes to the configured upstream branch even after pruning its tracking ref: %s', async pruned => {
        const fixture = createRemoteWorkflowFixture();
        cleanups.push(() => fixture.cleanup());
        const { repo, worktree, repository } = setup(fixture.local);
        repo.git(['remote', 'rename', 'origin', 'company/upstream']);
        repo.git(['checkout', '-qb', 'local-topic']);
        const head = repo.commitFile('topic.txt', 'topic\n', 'Topic');
        repo.git(['branch', '--set-upstream-to=company/upstream/main', 'local-topic']);
        repo.git(['checkout', '-q', 'main']);
        if (pruned) {
            fixture.remote.git(['symbolic-ref', 'HEAD', 'refs/heads/feature/nested']);
            fixture.remote.git(['update-ref', '-d', 'refs/heads/main']);
            await repository.fetchAll({});
        }

        await worktree.pushBranch(undefined, 'local-topic', {});

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/main'])).toBe(head);
        expect(fixture.remote.gitTrim(['branch', '--list', 'local-topic'])).toBe('');
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
    });

    it('keeps the local branch name as destination when the caller explicitly chooses a remote', async () => {
        const fixture = createRemoteWorkflowFixture();
        cleanups.push(() => fixture.cleanup());
        const { repo, worktree } = setup(fixture.local);
        const previous = fixture.remote.gitTrim(['rev-parse', 'refs/heads/main']);
        repo.git(['checkout', '-qb', 'local-topic']);
        const head = repo.commitFile('topic.txt', 'topic\n', 'Topic');
        repo.git(['branch', '--set-upstream-to=origin/main', 'local-topic']);

        await worktree.pushBranch('origin', 'local-topic', {});

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/main'])).toBe(previous);
        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-topic'])).toBe(head);
    });

    it('preserves the configured remote for a plain push after its tracking ref was pruned', async () => {
        const fixture = createRemoteWorkflowFixture();
        cleanups.push(() => fixture.cleanup());
        const { repo, worktree, repository } = setup(fixture.local);
        repo.git(['remote', 'add', 'aaa', fixture.remote.cwd]);
        fixture.remote.git(['update-ref', '-d', 'refs/heads/main']);
        await repository.fetch('origin', {});

        await worktree.push(undefined, {});

        expect(repo.gitTrim(['config', 'branch.main.remote'])).toBe('origin');
        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/main'])).toBe(repo.gitTrim(['rev-parse', 'HEAD']));
    });

    it.each(['fetch', 'fetchAll'] as const)('%s honors explicit tag fetching options', async operation => {
        const fixture = createRemoteWorkflowFixture();
        cleanups.push(() => fixture.cleanup());
        const { repository } = setup(fixture.local);
        fixture.seed.commitFile('tag-only.txt', 'tag only\n', 'Unpublished branch commit');
        fixture.seed.git(['tag', 'tag-only']);
        fixture.seed.git(['push', 'origin', 'refs/tags/tag-only']);
        fixture.local.git(['config', 'remote.origin.tagOpt', '--tags']);
        if (operation === 'fetch') { await repository.fetch('origin', { tags: false }); }
        else { await repository.fetchAll({ tags: false }); }
        expect(fixture.local.gitTrim(['tag', '--list', 'tag-only'])).toBe('');
        fixture.local.git(['config', 'remote.origin.tagOpt', '--no-tags']);
        if (operation === 'fetch') { await repository.fetch('origin', { tags: true }); }
        else { await repository.fetchAll({ tags: true }); }
        expect(fixture.local.gitTrim(['rev-parse', 'refs/tags/tag-only'])).toBe(fixture.seed.gitTrim(['rev-parse', 'refs/tags/tag-only']));
    });

    it('honors force during checkout only when explicitly requested', async () => {
        const { repo, worktree } = setup();
        repo.commitFile('file.txt', 'base\n', 'Base');
        repo.git(['checkout', '-qb', 'other']);
        repo.commitFile('file.txt', 'other\n', 'Other');
        repo.git(['checkout', '-q', 'main']);
        repo.write('file.txt', 'uncommitted\n');

        await expect(worktree.checkout('other', {})).rejects.toThrow();
        expect(fs.readFileSync(path.join(repo.cwd, 'file.txt'), 'utf8')).toBe('uncommitted\n');
        await worktree.checkout('other', { force: true });
        expect(fs.readFileSync(path.join(repo.cwd, 'file.txt'), 'utf8')).toBe('other\n');
    });

    it('supports signed-off empty commits and amendments', async () => {
        const { repo, worktree } = setup();
        const base = repo.commitFile('file.txt', 'base\n', 'Base');
        await expect(worktree.commit('Empty', {})).rejects.toThrow();
        await worktree.commit('Empty', { signoff: true, allowEmpty: true });
        expect(repo.gitTrim(['log', '-1', '--format=%B'])).toContain('Signed-off-by: Test User <test@example.com>');
        expect(repo.gitTrim(['rev-parse', 'HEAD^'])).toBe(base);
        await worktree.amendCommit('Amended empty', { signoff: true, allowEmpty: true });
        expect(repo.gitTrim(['log', '-1', '--format=%B'])).toContain('Amended empty\n\nSigned-off-by: Test User <test@example.com>');
        expect(repo.gitTrim(['rev-parse', 'HEAD^'])).toBe(base);
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
    });
});
