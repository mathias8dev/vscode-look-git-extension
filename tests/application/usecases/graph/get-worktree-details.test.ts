import { describe, expect, it, vi } from 'vitest';
import { GetWorktreeDetailsUseCase } from '../../../../src/application/usecases/graph/get-worktree-details';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GetWorktreeDetailsUseCase', () => {
    it('loads worktree metadata and combines staged, unstaged, conflict and untracked files', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [{
                path: '/repo-wt',
                head: 'abc123',
                branch: 'feature/wip',
                isMain: false,
                isDetached: false,
                isLocked: false,
            }]),
            execRaw: vi.fn(async () => [
                'M  staged.txt',
                ' M unstaged.txt',
                'MM both.txt',
                'UU conflict.txt',
                '?? untracked.txt',
                '',
            ].join('\0')),
        });

        const result = await new GetWorktreeDetailsUseCase().execute(repo, '/repo-wt');

        expect(result.path).toBe('/repo-wt');
        expect(result.head).toBe('abc123');
        expect(result.branch).toBe('feature/wip');
        expect(result.files).toEqual([
            { status: 'M', filePath: 'both.txt', origPath: undefined },
            { status: 'U', filePath: 'conflict.txt', origPath: undefined },
            { status: 'M', filePath: 'staged.txt', origPath: undefined },
            { status: 'M', filePath: 'unstaged.txt', origPath: undefined },
            { status: '?', filePath: 'untracked.txt', origPath: undefined },
        ]);
        expect(repo.execRaw).toHaveBeenCalledWith(['-C', '/repo-wt', 'status', '--porcelain=v1', '-z', '-u']);
    });

    it('rejects unknown worktree paths', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => []),
        });

        await expect(new GetWorktreeDetailsUseCase().execute(repo, '/missing')).rejects.toThrow('Unknown worktree: /missing');
    });
});
