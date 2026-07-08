import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryGraphLog } from '@extension/git/queries/query-graph';
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
});
