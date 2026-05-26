import { afterEach, describe, expect, it } from 'vitest';
import { createTempGitRepo, type TempGitRepo } from './helpers/gitRepo';

const repos: TempGitRepo[] = [];

function repo(): TempGitRepo {
    const r = createTempGitRepo();
    repos.push(r);
    return r;
}

function messages(r: TempGitRepo): string[] {
    return r.git(['log', '--format=%s']).split('\n').filter(Boolean);
}

afterEach(() => {
    while (repos.length > 0) {
        repos.pop()!.cleanup();
    }
});

describe('GitService log parsing', () => {
    it('parses commit messages and authors containing the old text separator', async () => {
        const r = repo();
        r.git(['config', 'user.name', 'Name Marker']);
        r.write('file.txt', 'one');
        r.commit('message with <<SEP>> marker');

        const [entry] = await r.service.getLog(1);

        expect(entry.message).toBe('message with <<SEP>> marker');
        expect(entry.authorName).toBe('Name Marker');
        expect(entry.parentHashes).toEqual([]);
    });

    it('supports skip and max count', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('one');
        r.write('file.txt', 'two');
        r.commit('two');
        r.write('file.txt', 'three');
        r.commit('three');

        const entries = await r.service.getLog(1, 1);

        expect(entries).toHaveLength(1);
        expect(entries[0].message).toBe('two');
    });
});

describe('GitService status parsing', () => {
    it('parses staged renames with spaces and arrows in file names', async () => {
        const r = repo();
        r.write('old -> file.txt', 'content');
        r.commit('initial');

        r.git(['mv', 'old -> file.txt', 'renamed file.txt']);
        const status = await r.service.getStatus();

        expect(status.staged).toContainEqual(expect.objectContaining({
            indexStatus: 'R',
            filePath: 'renamed file.txt',
            origPath: 'old -> file.txt',
        }));
        expect(status.unstaged).toEqual([]);
    });

    it('keeps untracked paths with newlines intact', async () => {
        const r = repo();
        r.write('tracked.txt', 'tracked');
        r.commit('initial');
        r.write('dir/weird -> file\nname.txt', 'untracked');

        const status = await r.service.getStatus();

        expect(status.unstaged).toContainEqual(expect.objectContaining({
            indexStatus: '?',
            workTreeStatus: '?',
            filePath: 'dir/weird -> file\nname.txt',
        }));
    });

    it('detects rebase conflict state', async () => {
        const r = repo();
        r.write('file.txt', 'base\n');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'side']);
        r.write('file.txt', 'side\n');
        r.commit('side');
        r.git(['checkout', '-q', 'main']);
        r.write('file.txt', 'main\n');
        r.commit('main');

        try {
            r.git(['rebase', 'side']);
        } catch {
            // Expected conflict.
        }

        const status = await r.service.getStatus();
        expect(status.conflictState).toBe('rebase');
        expect(status.conflicts.map((entry) => entry.filePath)).toContain('file.txt');
    });
});

describe('GitService commit file parsing', () => {
    it('detects renamed files and original paths in commits', async () => {
        const r = repo();
        r.write('old.txt', 'same');
        const parentHash = r.commit('initial');
        r.git(['mv', 'old.txt', 'new.txt']);
        const commitHash = r.commit('rename');

        const files = await r.service.getCommitFiles(commitHash);

        expect(files).toContainEqual(expect.objectContaining({
            status: 'R',
            filePath: 'new.txt',
            origPath: 'old.txt',
            parentHash,
        }));
    });

    it('annotates merge commit file changes with the parent used for each diff', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'side']);
        r.write('side.txt', 'side');
        const sideHash = r.commit('side');
        r.git(['checkout', '-q', 'main']);
        r.write('main.txt', 'main');
        const mainHash = r.commit('main');
        r.git(['merge', '-q', '--no-ff', 'side', '-m', 'merge']);
        const mergeHash = r.git(['rev-parse', 'HEAD']);

        const files = await r.service.getCommitFiles(mergeHash);

        expect(files).toContainEqual(expect.objectContaining({
            status: 'A',
            filePath: 'side.txt',
            parentHash: mainHash,
        }));
        expect(files).toContainEqual(expect.objectContaining({
            status: 'A',
            filePath: 'main.txt',
            parentHash: sideHash,
        }));
    });

    it('returns files from the root commit', async () => {
        const r = repo();
        r.write('root.txt', 'root');
        const rootHash = r.commit('root');

        const files = await r.service.getCommitFiles(rootHash);

        expect(files).toContainEqual(expect.objectContaining({
            status: 'A',
            filePath: 'root.txt',
        }));
    });
});

describe('GitService refs and graph data', () => {
    it('distinguishes local branches with slashes from remote branches', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.git(['branch', 'feature/foo']);
        r.git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
        r.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);

        const branches = await r.service.getAllBranches();

        expect(branches).toContainEqual(expect.objectContaining({
            name: 'feature/foo',
            isRemote: false,
        }));
        expect(branches).toContainEqual(expect.objectContaining({
            name: 'origin/main',
            isRemote: true,
        }));
        expect(branches.some((branch) => branch.name === 'origin/HEAD')).toBe(false);
    });

    it('filters graph log by path server-side', async () => {
        const r = repo();
        r.write('a.txt', 'a1');
        r.commit('touch a');
        r.write('b.txt', 'b1');
        r.commit('touch b');
        r.write('a.txt', 'a2');
        r.commit('touch a again');

        const graph = await r.service.getGraphLog(20, undefined, 'a.txt');

        expect(graph.map((entry) => entry.message)).toEqual(['touch a again', 'touch a']);
    });
});

describe('GitService stash parsing', () => {
    it('detects renamed files inside a stash', async () => {
        const r = repo();
        r.write('old.txt', 'same');
        r.commit('initial');
        r.git(['mv', 'old.txt', 'new.txt']);
        r.git(['stash', 'push', '-m', 'rename stash']);

        const stashes = await r.service.stashList();
        const files = await r.service.getStashFiles(0);

        expect(stashes[0].message).toContain('rename stash');
        expect(files).toContainEqual(expect.objectContaining({
            status: 'R',
            filePath: 'new.txt',
            origPath: 'old.txt',
        }));
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
});

describe('GitService commit operations', () => {
    it('creates a new commit with the given message', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');
        r.git(['add', 'file.txt']);

        await r.service.commit('second commit');

        expect(messages(r)[0]).toBe('second commit');
    });

    it('amends the last commit message', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('wrong message');

        await r.service.commitAmend('correct message');

        expect(messages(r)[0]).toBe('correct message');
    });

    it('reports uncommitted changes when the working tree is dirty', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');

        expect(await r.service.hasUncommittedChanges()).toBe(true);
    });

    it('reports no uncommitted changes on a clean repo', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');

        expect(await r.service.hasUncommittedChanges()).toBe(false);
    });

    it('returns the full commit message via getCommitMessage', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        const hash = r.commit('specific message');

        const msg = await r.service.getCommitMessage(hash);

        expect(msg.trim()).toBe('specific message');
    });
});

describe('GitService staging and working tree operations', () => {
    it('stages a specific file', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');

        await r.service.stageFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.staged).toContainEqual(expect.objectContaining({ filePath: 'file.txt', indexStatus: 'M' }));
        expect(status.unstaged.map((e) => e.filePath)).not.toContain('file.txt');
    });

    it('unstages a staged file back to unstaged', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');
        r.git(['add', 'file.txt']);

        await r.service.unstageFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
    });

    it('stages all modified files with stageAll', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.write('b.txt', 'b');
        r.commit('initial');
        r.write('a.txt', 'aa');
        r.write('b.txt', 'bb');

        await r.service.stageAll();

        const status = await r.service.getStatus();
        expect(status.staged.map((e) => e.filePath).sort()).toEqual(['a.txt', 'b.txt']);
        expect(status.unstaged).toEqual([]);
    });

    it('unstages all staged files with unstageAll', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.write('b.txt', 'b');
        r.commit('initial');
        r.write('a.txt', 'aa');
        r.write('b.txt', 'bb');
        r.git(['add', '-A']);

        await r.service.unstageAll();

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged.map((e) => e.filePath).sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('discards a tracked file modification', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('file.txt', 'modified');

        await r.service.discardFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.unstaged).toEqual([]);
    });

    it('discards an untracked file using clean fallback', async () => {
        const r = repo();
        r.write('tracked.txt', 'content');
        r.commit('initial');
        r.write('untracked.txt', 'new');

        await r.service.discardFile('untracked.txt');

        const status = await r.service.getStatus();
        expect(status.unstaged.map((e) => e.filePath)).not.toContain('untracked.txt');
    });
});

describe.sequential('GitService interactive history rewrites', () => {
    it('renames the root commit without requiring sed or a shell editor', async () => {
        const r = repo();
        r.write('root.txt', 'root');
        const rootHash = r.commit('root message');

        await r.service.renameCommit(rootHash, 'renamed root');

        expect(messages(r)[0]).toBe('renamed root');
    });

    it('drops a middle commit and leaves surrounding commits intact', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('one');
        r.write('file.txt', 'two');
        const middleHash = r.commit('two');
        r.write('other.txt', 'three');
        r.commit('three');

        await r.service.dropCommit(middleHash);

        expect(messages(r)).toEqual(['three', 'one']);
        expect(r.git(['show', 'HEAD:file.txt'])).toBe('one');
    });

    it('fixes up a child commit into its parent', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.write('feature.txt', 'parent\n');
        const parentHash = r.commit('parent');
        r.write('fix.txt', 'fix\n');
        const fixHash = r.commit('fix me');

        await r.service.fixupCommit(fixHash, parentHash);

        expect(messages(r)).toEqual(['parent', 'base']);
        expect(r.git(['show', 'HEAD:fix.txt'])).toBe('fix');
    });

    it('squashes consecutive commits into the oldest selected commit', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.write('one.txt', 'one');
        const oldestHash = r.commit('oldest selected');
        r.write('two.txt', 'two');
        const newestHash = r.commit('newest selected');

        await r.service.squashCommits(oldestHash, [newestHash]);

        expect(messages(r)).toEqual(['oldest selected', 'base']);
        expect(r.git(['show', 'HEAD:one.txt'])).toBe('one');
        expect(r.git(['show', 'HEAD:two.txt'])).toBe('two');
    });
});
