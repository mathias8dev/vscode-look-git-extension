import { describe, expect, it, vi } from 'vitest';
import { GetChangesStatusUseCase } from '../../../../src/application/usecases/changes/get-changes-status';
import type { GitStatus } from '../../../../src/core/git/domain/GitStatus';
import type { GitSubmodule } from '../../../../src/core/git/domain/GitWorktree';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GetChangesStatusUseCase', () => {
    it('loads status, stashes and submodules for a repository', async () => {
        const status: GitStatus = {
            staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'added.txt' }],
            unstaged: [],
            conflicts: [],
            conflictState: 'none',
        };
        const submodules: readonly GitSubmodule[] = [{ path: 'modules/auth-kit', status: '+' }];
        const repo = makeRepositoryMock({
            getStatus: vi.fn(async () => status),
            stashList: vi.fn(async () => [{ index: 0, message: 'WIP on main' }]),
            getSubmoduleStatus: vi.fn(async () => submodules),
            getCurrentBranch: vi.fn(async () => 'experimental'),
        });

        const result = await new GetChangesStatusUseCase().execute(repo);

        expect(result.status).toBe(status);
        expect(result.stashes).toEqual([{ index: 0, message: 'WIP on main' }]);
        expect(result.submodules).toEqual([{ path: 'modules/auth-kit', status: '+' }]);
        expect(result.currentBranch).toBe('experimental');
        expect(result.warnings).toEqual([]);
    });

    it('keeps submodule status failures optional', async () => {
        const status: GitStatus = { staged: [], unstaged: [], conflicts: [], conflictState: 'none' };
        const repo = makeRepositoryMock({
            getStatus: vi.fn(async () => status),
            stashList: vi.fn(async () => []),
            getSubmoduleStatus: vi.fn(async () => { throw new Error('no submodules available'); }),
        });

        const result = await new GetChangesStatusUseCase().execute(repo);

        expect(result.submodules).toEqual([]);
        expect(result.warnings.map((warning) => warning.operation)).toEqual(['changes/listSubmodules']);
    });

    it('propagates critical status failures', async () => {
        const repo = makeRepositoryMock({
            getStatus: vi.fn(async () => { throw new Error('status failed'); }),
        });

        await expect(new GetChangesStatusUseCase().execute(repo)).rejects.toThrow('status failed');
    });
});
