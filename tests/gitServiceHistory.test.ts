import { describe, expect, it } from 'vitest';
import { repo, expectGitFailure } from './helpers/gitServiceRuntime';

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

        expectGitFailure(r, ['rebase', 'side'], /CONFLICT|could not apply|Merge conflict/i);

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
        const mergeHash = r.gitTrim(['rev-parse', 'HEAD']);

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

    it('reports incoming remote changes for local branches behind their upstream', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.git(['remote', 'add', 'origin', '/tmp/look-git-origin.git']);
        r.git(['checkout', '-q', '-b', 'remote-source']);
        r.write('remote.txt', 'remote');
        const remoteHash = r.commit('remote commit');
        r.git(['checkout', '-q', 'main']);
        r.git(['update-ref', 'refs/remotes/origin/main', remoteHash]);
        r.git(['branch', '--set-upstream-to=origin/main', 'main']);

        const branches = await r.service.getAllBranches();
        const main = branches.find((branch) => branch.name === 'main');
        const remoteMain = branches.find((branch) => branch.name === 'origin/main');

        expect(main).toEqual(expect.objectContaining({
            upstream: 'origin/main',
            ahead: 0,
            behind: 1,
        }));
        expect(remoteMain).toEqual(expect.objectContaining({
            ahead: 0,
            behind: 0,
        }));
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

    it('applies graph search, author, and date filters before slicing the commit window', async () => {
        const r = repo();
        r.commitFile('target.txt', 'needle\n', 'needle target', {
            name: 'Alice Search',
            email: 'alice@example.com',
        }, '2024-02-01T00:00:00Z');
        r.commitFile('other.txt', 'other\n', 'unrelated newest', {
            name: 'Bob Search',
            email: 'bob@example.com',
        }, '2024-03-01T00:00:00Z');

        const graph = await r.service.getGraphLog(1, undefined, undefined, {
            search: 'needle target',
            authors: ['Alice Search'],
            dateFrom: '2024-02-01',
            dateTo: '2024-02-01',
        });

        expect(graph.map((entry) => entry.message)).toEqual(['needle target']);
    });

    it('keeps graph search semantics for author names and hashes before slicing the commit window', async () => {
        const r = repo();
        const aliceHash = r.commitFile('alice.txt', 'alice\n', 'quiet subject', {
            name: 'Alice Search',
            email: 'alice@example.com',
        }, '2024-02-01T00:00:00Z');
        r.commitFile('bob.txt', 'bob\n', 'newest unrelated', {
            name: 'Bob Search',
            email: 'bob@example.com',
        }, '2024-03-01T00:00:00Z');

        const byAuthor = await r.service.getGraphLog(1, undefined, undefined, { search: 'Alice Search' });
        const byHash = await r.service.getGraphLog(1, undefined, undefined, { search: aliceHash.slice(0, 8) });

        expect(byAuthor.map((entry) => entry.message)).toEqual(['quiet subject']);
        expect(byHash.map((entry) => entry.hash)).toEqual([aliceHash]);
    });

    it('keeps ancestor context for graph search results so the UI can preserve topology', async () => {
        const r = repo();
        const rootHash = r.commitFile('root.txt', 'root\n', 'root commit');
        const parentHash = r.commitFile('parent.txt', 'parent\n', 'parent context');
        const targetHash = r.commitFile('target.txt', 'target\n', 'needle target');
        r.commitFile('newest.txt', 'newest\n', 'newest unrelated');

        const graph = await r.service.getGraphLog(10, undefined, undefined, { search: 'needle target' });

        expect(graph.map((entry) => entry.hash)).toEqual([targetHash, parentHash, rootHash]);
        expect(graph[0].matchesFilter).toBe(true);
        expect(graph[1].matchesFilter).toBe(false);
    });
});

