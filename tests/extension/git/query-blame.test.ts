import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryBlame } from '@extension/git/queries/query-blame';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('queryBlame', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('reads blame annotations from a real repository', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const firstHash = repo.commitFile('src/app.ts', 'first\n', 'add first line', {
            name: 'Alice Example',
            email: 'alice@example.com',
        }, '2024-01-01T00:00:00Z');
        const secondHash = repo.commitFile('src/app.ts', 'first\nsecond\n', 'add second line', {
            name: 'Bob Example',
            email: 'bob@example.com',
        }, '2024-01-02T00:00:00Z');
        const backend = new GitCliBackend(repo.cwd);

        const lines = await queryBlame((args, signal) => backend.run(args, { signal }), 'src/app.ts');

        expect(lines).toEqual([
            expect.objectContaining({
                line: 1,
                commit: firstHash,
                author: 'Alice Example',
                summary: 'add first line',
            }),
            expect.objectContaining({
                line: 2,
                commit: secondHash,
                author: 'Bob Example',
                summary: 'add second line',
            }),
        ]);
    });
});
