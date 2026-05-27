import { describe, expect, it } from 'vitest';
import { GitService } from '../src/gitService';
import { repo, messages, expectGitFailure } from './helpers/gitServiceRuntime';

describe('GitService merge and rebase conflict handling', () => {
    it('detects an in-progress merge via isMergeInProgress', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('file.txt', 'feature\n');
        r.commit('feature');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['merge', 'feature'], /CONFLICT|Automatic merge failed/i);

        expect(await r.service.isMergeInProgress()).toBe(true);
    });

    it('detects merge conflict state in getStatus', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('file.txt', 'feature\n');
        r.commit('feature');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['merge', 'feature'], /CONFLICT|Automatic merge failed/i);

        const status = await r.service.getStatus();
        expect(status.conflictState).toBe('merge');
        expect(status.conflicts.map((e) => e.filePath)).toContain('file.txt');
    });

    it('aborts a merge and clears isMergeInProgress', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('file.txt', 'feature\n');
        r.commit('feature');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['merge', 'feature'], /CONFLICT|Automatic merge failed/i);

        await r.service.mergeAbort();

        expect(await r.service.isMergeInProgress()).toBe(false);
    });

    it('falls back to reset --merge when merge --abort fails', async () => {
        const calls: string[][] = [];
        class FallbackGitService extends GitService {
            public override async exec(args: string[]): Promise<string> {
                calls.push(args);
                if (args.join(' ') === 'merge --abort') {
                    throw new Error('merge abort failed');
                }
                return 'ok';
            }
        }

        await new FallbackGitService('/tmp').mergeAbort();

        expect(calls).toEqual([
            ['merge', '--abort'],
            ['reset', '--merge'],
        ]);
    });

    it('returns false for isMergeInProgress on a clean repo', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.isMergeInProgress()).toBe(false);
    });

    it('returns false for isRebaseInProgress on a clean repo', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.isRebaseInProgress()).toBe(false);
    });

    it('aborts a rebase and clears isRebaseInProgress', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'side']);
        r.write('file.txt', 'side\n');
        r.commit('side');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['rebase', 'side'], /CONFLICT|could not apply|Merge conflict/i);

        await r.service.rebaseAbort();

        expect(await r.service.isRebaseInProgress()).toBe(false);
    });

    it('accepts ours version of a conflicted file and resolves the conflict', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('file.txt', 'feature\n');
        r.commit('feature');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['merge', 'feature'], /CONFLICT|Automatic merge failed/i);

        await r.service.acceptOurs('file.txt');
        r.git(['add', 'file.txt']);

        const status = await r.service.getStatus();
        expect(status.conflicts).toEqual([]);
    });

    it('accepts theirs version of a conflicted file and resolves the conflict', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('file.txt', 'feature\n');
        r.commit('feature');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        expectGitFailure(r, ['merge', 'feature'], /CONFLICT|Automatic merge failed/i);

        await r.service.acceptTheirs('file.txt');
        r.git(['add', 'file.txt']);

        const status = await r.service.getStatus();
        expect(status.conflicts).toEqual([]);
    });
});

describe('GitService stash lifecycle', () => {
    it('stashes working tree changes and restores them with pop', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('file.txt', 'modified');

        await r.service.stash('my stash');

        expect(await r.service.hasUncommittedChanges()).toBe(false);

        await r.service.stashPop();

        const status = await r.service.getStatus();
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
    });

    it('stashes untracked files from the visible Changes set by default', async () => {
        const r = repo();
        r.write('tracked.txt', 'base');
        r.commit('initial');
        r.write('untracked.txt', 'new file');

        await r.service.stash();

        expect(r.git(['status', '--porcelain'])).not.toContain('untracked.txt');
        expect(r.git(['stash', 'show', '--include-untracked', '--name-only', 'stash@{0}'])).toContain('untracked.txt');
    });

    it('applies a stash without removing it from the stash list', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('file.txt', 'modified');
        await r.service.stash();

        await r.service.stashApply();

        const stashesAfter = await r.service.stashList();
        expect(stashesAfter).toHaveLength(1);
        const status = await r.service.getStatus();
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
    });

    it('drops a stash entry without applying it', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('file.txt', 'modified');
        await r.service.stash('to drop');

        await r.service.stashDrop();

        expect(await r.service.stashList()).toHaveLength(0);
        expect(await r.service.hasUncommittedChanges()).toBe(false);
    });

    it('stashes only staged changes with stashStaged', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('staged.txt', 'staged content');
        r.write('unstaged.txt', 'unstaged content');
        r.git(['add', 'staged.txt']);

        await r.service.stashStaged('staged only');

        const stashes = await r.service.stashList();
        expect(stashes).toHaveLength(1);
        const status = await r.service.getStatus();
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'unstaged.txt' }));
        expect(status.staged.map((e) => e.filePath)).not.toContain('staged.txt');
    });

    it('returns an empty stash list when there are no stashes', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.stashList()).toEqual([]);
    });
});

describe('GitService branch operations', () => {
    it('returns the current branch name', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.getCurrentBranch()).toBe('main');
    });

    it('checks out an existing branch', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['branch', 'other']);

        await r.service.checkout('other');

        expect(await r.service.getCurrentBranch()).toBe('other');
    });

    it('checks out a local commit in detached HEAD without creating changes', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        const hash = r.commit('initial');
        r.write('file.txt', 'two');
        r.commit('second');

        await r.service.checkoutDetached(hash);

        expect(await r.service.getCurrentBranch()).toBe('HEAD');
        expect(r.gitTrim(['rev-parse', 'HEAD'])).toBe(hash);
        expect(r.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('checks out a remote-tracking commit in detached HEAD without creating changes', async () => {
        const r = repo();
        r.write('file.txt', 'base');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'remote-source']);
        r.write('file.txt', 'remote');
        const remoteHash = r.commit('remote commit');
        r.git(['checkout', '-q', 'main']);
        r.git(['update-ref', 'refs/remotes/origin/remote-source', remoteHash]);
        r.git(['branch', '-D', 'remote-source']);

        await r.service.checkoutDetached(remoteHash);

        expect(await r.service.getCurrentBranch()).toBe('HEAD');
        expect(r.gitTrim(['rev-parse', 'HEAD'])).toBe(remoteHash);
        expect(r.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('creates and checks out a new branch from a commit', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        const hash = r.commit('initial');

        await r.service.checkoutNewBranch('feature/new', hash);

        expect(await r.service.getCurrentBranch()).toBe('feature/new');
    });

    it('force-deletes a local branch', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['branch', 'to-delete']);

        await r.service.deleteBranch('to-delete', true);

        const branches = await r.service.getAllBranches();
        expect(branches.every((b) => b.name !== 'to-delete')).toBe(true);
    });

    it('renames a local branch', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['branch', 'old-name']);

        await r.service.renameBranch('old-name', 'new-name');

        const branches = await r.service.getAllBranches();
        expect(branches.some((b) => b.name === 'new-name')).toBe(true);
        expect(branches.every((b) => b.name !== 'old-name')).toBe(true);
    });

    it('marks only the current branch as isCurrent', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['branch', 'other']);

        const branches = await r.service.getAllBranches();
        const main = branches.find((b) => b.name === 'main');
        const other = branches.find((b) => b.name === 'other');

        expect(main?.isCurrent).toBe(true);
        expect(other?.isCurrent).toBe(false);
    });

    it('returns an empty array for getRemotes when no remotes exist', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.getRemotes()).toEqual([]);
    });

    it('returns configured remotes in git order', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['remote', 'add', 'origin', '/tmp/origin.git']);
        r.git(['remote', 'add', 'upstream', '/tmp/upstream.git']);

        expect(await r.service.getRemotes()).toEqual(['origin', 'upstream']);
    });

    it('fetchBranch fetches a remote branch whose name contains slashes', async () => {
        const remote = repo();
        remote.write('file.txt', 'base');
        remote.commit('initial');
        remote.git(['checkout', '-q', '-b', 'feature/nested']);
        remote.write('feature.txt', 'remote feature');
        const remoteHead = remote.commit('feature commit');

        const r = repo();
        r.git(['remote', 'add', 'origin', remote.cwd]);

        await r.service.fetchBranch('origin', 'feature/nested');

        expect(r.gitTrim(['rev-parse', 'origin/feature/nested'])).toBe(remoteHead);
    });

    it('getTrackingBranch preserves branch names containing slashes', async () => {
        const remote = repo();
        remote.write('file.txt', 'base');
        remote.commit('initial');
        remote.git(['checkout', '-q', '-b', 'feature/nested']);
        remote.write('feature.txt', 'remote feature');
        remote.commit('feature commit');

        const r = repo();
        r.git(['remote', 'add', 'origin', remote.cwd]);
        await r.service.fetchBranch('origin', 'feature/nested');
        r.git(['checkout', '-q', '-b', 'feature/nested', 'origin/feature/nested']);

        expect(await r.service.getTrackingBranch()).toEqual({
            remote: 'origin',
            branch: 'feature/nested',
        });
    });
});
