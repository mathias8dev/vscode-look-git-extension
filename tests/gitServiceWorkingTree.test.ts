import { afterEach, describe, expect, it } from 'vitest';
import { GitService } from '../src/gitService';
import { repo, messages } from './helpers/gitServiceRuntime';
import { addLinkedWorktree, createSubmoduleFixture, createTempGitRepo } from './helpers/gitRepo';

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

    it('unstages newly added files with unstageAll', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('initial');
        r.write('new-file.txt', 'new');
        r.git(['add', '-A']);

        await r.service.unstageAll();

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'new-file.txt' }));
    });

    it('falls back to reset when restore --staged fails while unstaging', async () => {
        const calls: string[][] = [];
        class FallbackGitService extends GitService {
            public override async exec(args: string[]): Promise<string> {
                calls.push(args);
                if (args[0] === 'restore') {
                    throw new Error('restore failed');
                }
                return 'ok';
            }
        }

        const service = new FallbackGitService('/tmp');
        await service.unstageFile('a.txt');
        await service.unstageAll();

        expect(calls).toEqual([
            ['restore', '--staged', '--', 'a.txt'],
            ['reset', '-q', 'HEAD', '--', 'a.txt'],
            ['restore', '--staged', '.'],
            ['reset', '-q', 'HEAD', '--', '.'],
        ]);
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
        expect(r.git(['show', 'HEAD:fix.txt'])).toBe('fix\n');
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

    it('uses a custom message when squashing commits', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.write('one.txt', 'one');
        const oldestHash = r.commit('oldest selected');
        r.write('two.txt', 'two');
        const newestHash = r.commit('newest selected');

        await r.service.squashCommits(oldestHash, [newestHash], 'custom squash message');

        expect(messages(r)).toEqual(['custom squash message', 'base']);
        expect(r.git(['show', 'HEAD:one.txt'])).toBe('one');
        expect(r.git(['show', 'HEAD:two.txt'])).toBe('two');
    });
});

describe('GitService worktree operations', () => {
    const repos: Array<{ cleanup(): void }> = [];
    const worktrees: Array<{ cleanup(): void }> = [];

    afterEach(() => {
        while (worktrees.length) { worktrees.pop()!.cleanup(); }
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('listWorktrees returns main worktree with isMain:true', async () => {
        const r = createTempGitRepo();
        repos.push(r);
        r.write('a.txt', 'a');
        r.commit('init');

        const wts = await r.service.listWorktrees();

        expect(wts).toHaveLength(1);
        expect(wts[0].isMain).toBe(true);
        expect(wts[0].isDetached).toBe(false);
        expect(wts[0].path).toBe(r.cwd);
    });

    it('listWorktrees returns linked worktree path and branch', async () => {
        const r = createTempGitRepo();
        repos.push(r);
        r.write('a.txt', 'a');
        r.commit('init');

        const wt = addLinkedWorktree(r, 'wt-feature');
        worktrees.push(wt);

        const wts = await r.service.listWorktrees();

        expect(wts).toHaveLength(2);
        const linked = wts.find((w) => !w.isMain)!;
        expect(linked.path).toBe(wt.worktreePath);
        expect(linked.branch).toBe('refs/heads/wt-feature');
        expect(linked.isDetached).toBe(false);
    });

    it('listWorktrees marks detached worktree', async () => {
        const r = createTempGitRepo();
        repos.push(r);
        r.write('a.txt', 'a');
        const hash = r.commit('init');
        const wtPath = addLinkedWorktree(r, 'tmp-branch');
        worktrees.push(wtPath);
        // convert to detached
        const detachedService = new GitService(wtPath.worktreePath);
        await detachedService.checkoutDetached(hash);

        const wts = await r.service.listWorktrees();
        const linked = wts.find((w) => !w.isMain)!;
        expect(linked.isDetached).toBe(true);
        expect(linked.branch).toBeUndefined();
    });

    it('addWorktree creates a worktree that appears in listWorktrees', async () => {
        const r = createTempGitRepo();
        repos.push(r);
        r.write('a.txt', 'a');
        r.commit('init');

        const wtPath = require('os').tmpdir() + '/look-git-wt-add-' + Date.now();
        await r.service.addWorktree(wtPath, 'add-feature', true);
        worktrees.push({ cleanup: () => { try { r.git(['worktree', 'remove', '--force', wtPath]); } catch { /* */ } require('fs').rmSync(wtPath, { recursive: true, force: true }); } });

        const wts = await r.service.listWorktrees();
        const found = wts.find((w) => w.path === wtPath);
        expect(found).toBeDefined();
        expect(found!.branch).toBe('refs/heads/add-feature');
    });

    it('removeWorktree removes the worktree from listWorktrees', async () => {
        const r = createTempGitRepo();
        repos.push(r);
        r.write('a.txt', 'a');
        r.commit('init');

        const wt = addLinkedWorktree(r, 'to-remove');
        // don't push to worktrees — we remove manually
        await r.service.removeWorktree(wt.worktreePath);
        require('fs').rmSync(wt.worktreePath, { recursive: true, force: true });

        const wts = await r.service.listWorktrees();
        expect(wts.every((w) => w.path !== wt.worktreePath)).toBe(true);
    });
});

describe('GitService submodule detection', () => {
    const fixtures: Array<{ cleanup(): void }> = [];

    afterEach(() => { while (fixtures.length) { fixtures.pop()!.cleanup(); } });

    it('getSubmodulePaths returns empty Set when no submodules', async () => {
        const r = createTempGitRepo();
        fixtures.push(r);
        r.write('a.txt', 'a');
        r.commit('init');

        const paths = await r.service.getSubmodulePaths();
        expect(paths.size).toBe(0);
    });

    it.skipIf(process.platform === 'win32')(
        'getSubmodulePaths returns registered submodule path',
        async () => {
            const { parent, subPath, cleanup } = createSubmoduleFixture();
            fixtures.push({ cleanup });

            const paths = await parent.service.getSubmodulePaths();
            expect(paths.has(subPath)).toBe(true);
        },
    );

    it.skipIf(process.platform === 'win32')(
        'getStatus marks staged submodule entry as isSubmodule:true',
        async () => {
            const { parent, subPath, cleanup } = createSubmoduleFixture();
            fixtures.push({ cleanup });

            // Modify the submodule pointer so it appears in staged
            const childService = new GitService(require('path').join(parent.cwd, subPath));
            parent.write(require('path').join(subPath, 'extra.txt'), 'extra\n');
            parent.git(['-C', require('path').join(parent.cwd, subPath), 'add', '-A']);
            parent.git(['-C', require('path').join(parent.cwd, subPath), 'commit', '-q', '-m', 'child commit']);
            parent.git(['add', subPath]);

            const status = await parent.service.getStatus();
            const entry = status.staged.find((e) => e.filePath === subPath);
            expect(entry).toBeDefined();
            expect(entry!.isSubmodule).toBe(true);
        },
    );

    it.skipIf(process.platform === 'win32')(
        'getStatus does not mark regular files as isSubmodule',
        async () => {
            const { parent, cleanup } = createSubmoduleFixture();
            fixtures.push({ cleanup });
            parent.write('regular.txt', 'hello');
            parent.git(['add', 'regular.txt']);

            const status = await parent.service.getStatus();
            const entry = status.staged.find((e) => e.filePath === 'regular.txt');
            expect(entry).toBeDefined();
            expect(entry!.isSubmodule).toBeFalsy();
        },
    );
});
