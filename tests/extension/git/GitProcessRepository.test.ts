import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { createTempGitRepo, addLinkedWorktree, createSubmoduleFixture, type TempGitRepo } from '../../helpers/gitRepo';
import { expectItem } from '../../helpers/assertions';

describe('GitProcessRepository', () => {
    const repos: TempGitRepo[] = [];
    const cleanups: Array<{ cleanup(): void }> = [];

    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!.cleanup(); }
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    function repo(): TempGitRepo {
        const r = createTempGitRepo();
        repos.push(r);
        return r;
    }

    // ── exec & getGitDir ─────────────────────────────────────────────────

    it('exec returns trimmed stdout', async () => {
        const r = repo();
        const git = new GitProcessRepository(r.cwd);
        const result = await git.exec(['rev-parse', '--show-toplevel']);
        expect(result).toBe(r.cwd);
    });

    it('getGitDir returns the .git path', async () => {
        const r = repo();
        const git = new GitProcessRepository(r.cwd);
        const gitDir = await git.getGitDir();
        expect(gitDir).toContain('.git');
    });

    it('exec rejects on unknown git command', async () => {
        const r = repo();
        const git = new GitProcessRepository(r.cwd);
        await expect(git.exec(['not-a-real-command'])).rejects.toThrow();
    });

    it('exec respects AbortSignal', async () => {
        const r = repo();
        const git = new GitProcessRepository(r.cwd);
        const controller = new AbortController();
        controller.abort();
        await expect(git.exec(['status'], controller.signal)).rejects.toThrow();
    });

    // ── Status ────────────────────────────────────────────────────────────

    it('getStatus returns empty staged/unstaged on clean repo with initial commit', async () => {
        const r = repo();
        r.write('a.txt', 'hello');
        r.commit('init');
        const git = new GitProcessRepository(r.cwd);
        const status = await git.getStatus();
        expect(status.staged).toHaveLength(0);
        expect(status.unstaged).toHaveLength(0);
    });

    it('getStatus detects staged file', async () => {
        const r = repo();
        r.write('a.txt', 'hello');
        r.commit('init');
        r.write('b.txt', 'new');
        r.git(['add', 'b.txt']);
        const git = new GitProcessRepository(r.cwd);
        const status = await git.getStatus();
        expect(status.staged.some((e) => e.filePath === 'b.txt')).toBe(true);
    });

    // ── Mutations ─────────────────────────────────────────────────────────

    it('stageFile stages a file', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        r.write('b.txt', 'b');
        const git = new GitProcessRepository(r.cwd);
        await git.stageFile('b.txt');
        const status = await git.getStatus();
        expect(status.staged.some((e) => e.filePath === 'b.txt')).toBe(true);
    });

    it('commit creates a new commit', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        r.write('b.txt', 'b');
        const git = new GitProcessRepository(r.cwd);
        await git.stageFile('b.txt');
        await git.commit('add b');
        const log = await git.getLog(2, 0);
        expect(expectItem(log, 0).message).toBe('add b');
    });

    // ── Branches & commits ────────────────────────────────────────────────

    it('getAllBranches returns current branch marked isCurrent', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        const git = new GitProcessRepository(r.cwd);
        const branches = await git.getAllBranches();
        expect(branches.some((b) => b.isCurrent && b.name === 'main')).toBe(true);
    });

    it('getLog returns commits in reverse chronological order', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('first');
        r.write('b.txt', 'b');
        r.commit('second');
        const git = new GitProcessRepository(r.cwd);
        const log = await git.getLog(5, 0);
        expect(expectItem(log, 0).message).toBe('second');
        expect(expectItem(log, 1).message).toBe('first');
    });

    it('getGraphLog excludes stash implementation commits', async () => {
        const r = repo();
        r.write('base.txt', 'base\n');
        r.commit('feat(graph): base');
        r.write('wip.txt', 'wip\n');
        r.git(['stash', 'push', '-u', '-m', 'wip(graph): stash graph fixture', '--', 'wip.txt']);

        const git = new GitProcessRepository(r.cwd);
        const graph = await git.getGraphLog(20);

        expect(graph.map((commit) => commit.message)).toEqual(['feat(graph): base']);
    });

    it('getGraphLog uses rewritten parents for path-filtered histories', async () => {
        const r = repo();
        const a1 = r.commitFile('a.txt', 'a1\n', 'feat(graph): add first selected file change');
        r.commitFile('b.txt', 'b1\n', 'feat(graph): add first unrelated file change');
        const a2 = r.commitFile('a.txt', 'a2\n', 'feat(graph): add second selected file change');
        r.commitFile('b.txt', 'b2\n', 'feat(graph): add second unrelated file change');
        const a3 = r.commitFile('a.txt', 'a3\n', 'feat(graph): add third selected file change');

        const git = new GitProcessRepository(r.cwd);
        const graph = await git.getGraphLog(10, undefined, 'a.txt');

        expect(graph.map((commit) => commit.hash)).toEqual([a3, a2, a1]);
        expect(expectItem(graph, 0).parentHashes).toEqual([a2]);
        expect(expectItem(graph, 1).parentHashes).toEqual([a1]);
        expect(expectItem(graph, 2).parentHashes).toEqual([]);
    });

    // ── Worktrees ─────────────────────────────────────────────────────────

    it('listWorktrees returns main worktree with isMain:true', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        const git = new GitProcessRepository(r.cwd);
        const wts = await git.listWorktrees();
        expect(wts).toHaveLength(1);
        const mainWorktree = expectItem(wts, 0);
        expect(mainWorktree.isMain).toBe(true);
        expect(mainWorktree.path).toBe(r.cwd);
    });

    it('addWorktree creates a linked worktree visible in listWorktrees', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        const git = new GitProcessRepository(r.cwd);
        const wtPath = path.join(os.tmpdir(), `look-git-wt-test-${Date.now()}`);
        cleanups.push({ cleanup() { fs.rmSync(wtPath, { recursive: true, force: true }); } });
        await git.addWorktree(wtPath, 'wt-branch', true);
        const wts = await git.listWorktrees();
        expect(wts.some((w) => w.path === wtPath)).toBe(true);
    });

    it('removeWorktree removes linked worktree from list', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        const wt = addLinkedWorktree(r, 'to-remove');
        cleanups.push(wt);
        const git = new GitProcessRepository(r.cwd);
        await git.removeWorktree(wt.worktreePath);
        fs.rmSync(wt.worktreePath, { recursive: true, force: true });
        const wts = await git.listWorktrees();
        expect(wts.every((w) => w.path !== wt.worktreePath)).toBe(true);
    });

    // ── Submodules ────────────────────────────────────────────────────────

    it('getSubmoduleStatus returns empty array with no submodules', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('init');
        const git = new GitProcessRepository(r.cwd);
        const subs = await git.getSubmoduleStatus();
        expect(subs).toHaveLength(0);
    });

    it.skipIf(process.platform === 'win32')(
        'getStatus marks submodule entries as isSubmodule:true',
        async () => {
            const { parent, subPath, cleanup } = createSubmoduleFixture();
            cleanups.push({ cleanup });
            const git = new GitProcessRepository(parent.cwd);
            // Advance the submodule HEAD so the pointer changes in parent
            parent.write(`${subPath}/extra.txt`, 'extra\n');
            parent.git(['-C', path.join(parent.cwd, subPath), 'add', '-A']);
            parent.git(['-C', path.join(parent.cwd, subPath), 'commit', '-q', '-m', 'child commit']);
            parent.git(['add', subPath]);
            const status = await git.getStatus();
            const entry = status.staged.find((e) => e.filePath === subPath);
            expect(entry).toBeDefined();
            expect(entry!.isSubmodule).toBe(true);
        },
    );
});
