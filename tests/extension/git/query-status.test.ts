import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryStatus } from '@extension/git/queries/query-status';
import { createSubmoduleFixture, createTempGitRepo } from '@tests/helpers/git-repo';

describe('queryStatus', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!(); }
    });

    it('identifies gitlinks from status without a separate submodule scan', async () => {
        const exec = vi.fn(async (args: readonly string[]) => {
            if (args[0] === 'status') { return '1 .M S.M. 160000 160000 160000 abc123 abc123 libs/one\0'; }
            throw new Error('No merge or rebase in progress.');
        });

        await expect(queryStatus(exec)).resolves.toMatchObject({ unstaged: [{ filePath: 'libs/one', isSubmodule: true }] });
        expect(exec).toHaveBeenCalledWith(['status', '--porcelain=v2', '-z', '-u'], undefined);
        expect(exec.mock.calls.some(([args]) => args[0] === 'config' || args[0] === 'submodule')).toBe(false);
    });

    it('keeps dirty registered submodules identified in parent status', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        fixture.parent.write(`${fixture.subPath}/child.txt`, 'changed child content\n');
        const git = new GitCliBackend(fixture.parent.cwd);

        const status = await queryStatus((args, signal) => git.run(args, {
            signal,
            env: { GIT_OPTIONAL_LOCKS: '0' },
        }));

        expect(status.unstaged).toContainEqual(expect.objectContaining({
            filePath: fixture.subPath,
            isSubmodule: true,
        }));
    });

    it('does not classify a regular file from stale .gitmodules configuration as a submodule', async () => {
        const repo = createTempGitRepo();
        cleanups.push(repo.cleanup);
        repo.write('ordinary.txt', 'before\n');
        repo.write('.gitmodules', '[submodule "old"]\n\tpath = ordinary.txt\n\turl = ../old\n');
        repo.commit('initial');
        repo.write('ordinary.txt', 'after\n');
        const git = new GitCliBackend(repo.cwd);

        const status = await queryStatus((args, signal) => git.run(args, { signal }));

        expect(status.unstaged).toContainEqual(expect.objectContaining({
            filePath: 'ordinary.txt',
            isSubmodule: undefined,
        }));
    });

    it('identifies removed gitlinks even after their .gitmodules entry is removed', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        fixture.parent.git(['rm', '-f', '--', fixture.subPath]);
        const git = new GitCliBackend(fixture.parent.cwd);

        const status = await queryStatus((args, signal) => git.run(args, { signal }));

        expect(status.staged).toContainEqual(expect.objectContaining({
            filePath: fixture.subPath,
            indexStatus: 'D',
            isSubmodule: true,
        }));
    });

    it('propagates cancellation while probing the conflict state', async () => {
        const controller = new AbortController();
        const exec = async (args: readonly string[]) => {
            if (args[0] === 'status') { return ''; }
            controller.abort();
            throw controller.signal.reason;
        };

        await expect(queryStatus(exec, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
});
