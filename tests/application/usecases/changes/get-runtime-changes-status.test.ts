import { describe, expect, it, vi } from 'vitest';
import { Page } from '../../../../src/core/git/domain/Page';
import type { GitStatus } from '../../../../src/core/git/domain/GitStatus';
import type { GitSubmodule } from '../../../../src/core/git/domain/GitWorktree';
import { GetRuntimeChangesStatusUseCase } from '../../../../src/application/usecases/changes/get-runtime-changes-status';
import type { GitReferenceOperations, GitStashOperations, GitStatusOperations, GitSubmoduleOperations } from '../../../../src/application/ports/git-capabilities';

describe('GetRuntimeChangesStatusUseCase', () => {
    it('loads status from a worktree and repository metadata from repository capabilities', async () => {
        const status: GitStatus = {
            staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'added.txt' }],
            unstaged: [],
            conflicts: [],
            conflictState: 'none',
        };
        const submodules: readonly GitSubmodule[] = [{ path: 'modules/auth-kit', status: '+' }];
        const repository = repositoryCapabilities({
            listSubmodules: vi.fn(async () => submodules),
            listBranches: vi.fn(async () => [
                { name: 'main', isRemote: false, isCurrent: false, hash: 'a', ahead: 0, behind: 0 },
                { name: 'feature/runtime', isRemote: false, isCurrent: true, hash: 'b', ahead: 1, behind: 0 },
            ]),
        });
        const worktree = worktreeCapabilities({
            getStatus: vi.fn(async () => status),
            listStashes: vi.fn(async () => new Page([{ index: 0, message: 'WIP runtime' }], false)),
        });

        const result = await new GetRuntimeChangesStatusUseCase().execute(repository, worktree);

        expect(result.status).toBe(status);
        expect(result.stashes).toEqual([{ index: 0, message: 'WIP runtime' }]);
        expect(result.submodules).toEqual(submodules);
        expect(result.currentBranch).toBe('feature/runtime');
        expect(result.warnings).toEqual([]);
    });

    it('keeps repository metadata failures optional', async () => {
        const status: GitStatus = { staged: [], unstaged: [], conflicts: [], conflictState: 'none' };
        const repository = repositoryCapabilities({
            listSubmodules: vi.fn(async () => { throw new Error('submodules unavailable'); }),
            listBranches: vi.fn(async () => { throw new Error('branches unavailable'); }),
        });
        const worktree = worktreeCapabilities({
            getStatus: vi.fn(async () => status),
            listStashes: vi.fn(async () => new Page([], false)),
        });

        const result = await new GetRuntimeChangesStatusUseCase().execute(repository, worktree);

        expect(result.submodules).toEqual([]);
        expect(result.currentBranch).toBeUndefined();
        expect(result.warnings.map((warning) => warning.operation)).toEqual(['changes/listSubmodules', 'changes/listBranches']);
    });

    it('propagates critical worktree status failures', async () => {
        const repository = repositoryCapabilities();
        const worktree = worktreeCapabilities({
            getStatus: vi.fn(async () => { throw new Error('status failed'); }),
        });

        await expect(new GetRuntimeChangesStatusUseCase().execute(repository, worktree)).rejects.toThrow('status failed');
    });
});

function repositoryCapabilities(overrides: Partial<GitReferenceOperations & GitSubmoduleOperations> = {}): GitReferenceOperations & GitSubmoduleOperations {
    return {
        listBranches: vi.fn(async () => []),
        listRemoteBranches: vi.fn(async () => []),
        listTags: vi.fn(async () => []),
        listRemotes: vi.fn(async () => []),
        resolveRef: vi.fn(async () => ''),
        listSubmodules: vi.fn(async () => []),
        getSubmoduleStatus: vi.fn(async () => ({ path: '', status: ' ' })),
        initSubmodule: vi.fn(async () => {}),
        updateSubmodule: vi.fn(async () => {}),
        syncSubmodule: vi.fn(async () => {}),
        fetchSubmodule: vi.fn(async () => {}),
        deinitSubmodule: vi.fn(async () => {}),
        openSubmoduleRepository: vi.fn(async () => ''),
        ...overrides,
    };
}

function worktreeCapabilities(overrides: Partial<GitStatusOperations & GitStashOperations> = {}): GitStatusOperations & GitStashOperations {
    return {
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' })),
        getUntrackedFiles: vi.fn(async () => new Page([], false)),
        getIgnoredFiles: vi.fn(async () => new Page([], false)),
        listStashes: vi.fn(async () => new Page([], false)),
        stash: vi.fn(async () => {}),
        applyStash: vi.fn(async () => {}),
        popStash: vi.fn(async () => {}),
        dropStash: vi.fn(async () => {}),
        clearStashes: vi.fn(async () => {}),
        branchFromStash: vi.fn(async () => {}),
        ...overrides,
    };
}
