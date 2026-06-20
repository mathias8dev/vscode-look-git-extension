import { describe, expect, it } from 'vitest';
import { RepoKind } from '../../../src/core/git/domain/RepoContext';
import { createGitExecutionContext } from '../../../src/extension/git/execution-context';
import type { GitRepository } from '../../../src/application/ports/git-repository';

describe('createGitExecutionContext', () => {
    it('creates runtime execution facts from a main repository context', async () => {
        await expect(createGitExecutionContext(repository('/repo', '/repo/.git'), {
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        })).resolves.toEqual({
            cwd: '/repo',
            gitDir: '/repo/.git',
            repositoryId: 'repo',
            worktreeId: 'repo',
            kind: 'main',
            parentRepositoryId: undefined,
        });
    });

    it('uses the parent id as repository id for worktree contexts', async () => {
        await expect(createGitExecutionContext(repository('/repo-linked', '/repo/.git/worktrees/repo-linked'), {
            id: 'worktree',
            cwd: '/repo-linked',
            kind: RepoKind.Worktree,
            parentId: 'repo',
            label: 'repo-linked',
        })).resolves.toMatchObject({
            repositoryId: 'repo',
            worktreeId: 'worktree',
            kind: 'main',
            parentRepositoryId: 'repo',
        });
    });
});

function repository(cwd: string, gitDir: string): GitRepository {
    return {
        cwd,
        getGitDir: async () => gitDir,
    } as GitRepository;
}
