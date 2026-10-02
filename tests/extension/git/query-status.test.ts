import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryStatus, querySubmodulePaths } from '@extension/git/queries/query-status';
import { createSubmoduleFixture } from '@tests/helpers/git-repo';

describe('querySubmodulePaths', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!(); }
    });

    it('reads registered paths without inspecting submodule worktrees', async () => {
        const exec = vi.fn(async (args: readonly string[]) => {
            if (args[0] === 'config') {
                return 'submodule.one.path\nlibs/one\0submodule.two.path\nlibs/two\0';
            }
            throw new Error(`Unexpected git invocation: ${args.join(' ')}`);
        });

        await expect(querySubmodulePaths(exec)).resolves.toEqual(new Set(['libs/one', 'libs/two']));
        expect(exec).toHaveBeenCalledOnce();
        expect(exec).toHaveBeenCalledWith([
            'config',
            '--file',
            '.gitmodules',
            '--null',
            '--get-regexp',
            '^submodule\\..*\\.path$',
        ], undefined);
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
});
