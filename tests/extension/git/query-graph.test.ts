import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryAllBranches, queryCommitLog, queryCurrentBranch, queryGraphLog } from '@extension/git/queries/query-graph';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('queryGraphLog', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('limits HEAD-scoped history to commits reachable from the current branch', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const mainHash = repo.commitFile('main.txt', 'main\n', 'main commit');
        repo.git(['checkout', '-q', '-b', 'feature/topic']);
        const featureHash = repo.commitFile('feature.txt', 'feature\n', 'feature commit');
        repo.git(['checkout', '-q', 'main']);
        const backend = new GitCliBackend(repo.cwd);

        const commits = await queryGraphLog((args, signal) => backend.run(args, { signal }), 50, ['HEAD']);

        expect(commits.map((commit) => commit.hash)).toEqual([mainHash]);
        expect(commits.map((commit) => commit.hash)).not.toContain(featureHash);
    });

    it('includes every ref when no branch filter is given', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const mainHash = repo.commitFile('main.txt', 'main\n', 'main commit');
        repo.git(['checkout', '-q', '-b', 'feature/topic']);
        const featureHash = repo.commitFile('feature.txt', 'feature\n', 'feature commit');
        repo.git(['checkout', '-q', 'main']);
        const backend = new GitCliBackend(repo.cwd);

        const commits = await queryGraphLog((args, signal) => backend.run(args, { signal }), 50);

        expect(commits.map((commit) => commit.hash)).toEqual(expect.arrayContaining([mainHash, featureHash]));
    });

    it('returns no commits for an explicitly requested unborn HEAD', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const backend = new GitCliBackend(repo.cwd);

        const commits = await queryGraphLog((args, signal) => backend.run(args, { signal }), 50, ['HEAD']);

        expect(commits).toEqual([]);
    });

    it('returns no commits when the symbolic current branch is explicitly requested before the first commit', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.git(['symbolic-ref', 'HEAD', 'refs/heads/master']);
        const backend = new GitCliBackend(repo.cwd);
        const run = (args: readonly string[], signal?: AbortSignal) => backend.run(args, { signal });

        const graph = await queryGraphLog(run, 50, ['master']);
        const qualifiedGraph = await queryGraphLog(run, 50, ['refs/heads/master']);
        const history = await queryCommitLog(run, 50, 0, 'master');

        expect(graph).toEqual([]);
        expect(qualifiedGraph).toEqual([]);
        expect(history).toEqual([]);
    });

    it('keeps valid refs when an explicitly requested current branch is unborn', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const mainHash = repo.commitFile('main.txt', 'main\n', 'main commit');
        repo.git(['symbolic-ref', 'HEAD', 'refs/heads/master']);
        const backend = new GitCliBackend(repo.cwd);

        const commits = await queryGraphLog(
            (args, signal) => backend.run(args, { signal }),
            50,
            ['master', 'main'],
        );

        expect(commits.map((commit) => commit.hash)).toEqual([mainHash]);
    });

    it('does not treat an arbitrary missing branch as an unborn current branch', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.git(['symbolic-ref', 'HEAD', 'refs/heads/master']);
        const backend = new GitCliBackend(repo.cwd);

        await expect(queryGraphLog(
            (args, signal) => backend.run(args, { signal }),
            50,
            ['missing'],
        )).rejects.toThrow(/ambiguous argument 'missing'/i);
    });

    it('returns the symbolic current branch before the first commit', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const backend = new GitCliBackend(repo.cwd);
        const runRaw = (args: readonly string[], signal?: AbortSignal) => backend.run(args, { signal });
        const runTrimmed = async (args: readonly string[], signal?: AbortSignal) => (await runRaw(args, signal)).trim();

        const currentBranch = await queryCurrentBranch(runTrimmed);
        const branches = await queryAllBranches(runRaw, (signal) => queryCurrentBranch(runTrimmed, signal));

        expect(currentBranch).toBe('main');
        expect(branches).toEqual([{
            name: 'main',
            isCurrent: true,
            hash: '',
            upstream: undefined,
            ahead: 0,
            behind: 0,
            isRemote: false,
        }]);
    });
});
