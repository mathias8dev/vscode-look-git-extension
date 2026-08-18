import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryRegisteredSubmodulePaths, querySubmoduleStatus } from '@extension/git/queries/query-submodules';
import { createSubmoduleFixture } from '@tests/helpers/git-repo';

describe('querySubmoduleStatus', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!(); }
    });

    it('returns registered submodules when the index also contains an unregistered gitlink', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        const commit = fixture.parent.gitTrim(['rev-parse', 'HEAD']);
        fixture.parent.git([
            'update-index',
            '--add',
            '--cacheinfo',
            `160000,${commit},.worktrees/push-destination-ownership`,
        ]);
        const git = new GitCliBackend(fixture.parent.cwd);

        await expect(querySubmoduleStatus((args, signal) => git.run(args, { signal }))).resolves.toEqual([
            { path: fixture.subPath, status: ' ' },
        ]);
    });

    it('returns no registered paths when git config reports no values', async () => {
        const noValueError = Object.assign(new Error('No submodule configuration.'), { code: 1 });

        await expect(queryRegisteredSubmodulePaths(async () => { throw noValueError; })).resolves.toEqual([]);
    });

    it('propagates cancellation and git configuration errors', async () => {
        const abortError = new Error('Cancelled.');
        abortError.name = 'AbortError';
        const configError = Object.assign(new Error('Malformed .gitmodules.'), { code: 3 });

        await expect(queryRegisteredSubmodulePaths(async () => { throw abortError; })).rejects.toBe(abortError);
        await expect(queryRegisteredSubmodulePaths(async () => { throw configError; })).rejects.toBe(configError);
    });
});
