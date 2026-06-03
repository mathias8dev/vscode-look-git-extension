import { describe, expect, it, vi } from 'vitest';
import { GetGraphDataUseCase } from '../../../../src/application/usecases/graph/get-graph-data';
import type { GitGraphCommit } from '../../../../src/core/git/domain/GitCommit';
import type { GitBranch } from '../../../../src/core/git/domain/GitStatus';
import type { GitWorktree } from '../../../../src/core/git/domain/GitWorktree';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GetGraphDataUseCase', () => {
    it('passes graph filters to the repository and paginates commits', async () => {
        const commits = [
            commit('a1', 'feat(graph): first'),
            commit('b2', 'fix(graph): second'),
            commit('c3', 'test(graph): third'),
        ];
        const branches = [branch('main', true)];
        const getGraphLog = vi.fn(async () => commits);
        const repo = makeRepositoryMock({
            getGraphLog,
            getAllBranches: vi.fn(async () => branches),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            getRemotes: vi.fn(async () => ['origin']),
            listWorktrees: vi.fn(async () => []),
        });

        const result = await new GetGraphDataUseCase().execute(
            repo,
            { search: 'fix', authors: ['Ada'], dateFrom: '2026-01-01', dateTo: '2026-01-02', path: 'src', branches: ['main'] },
            { offset: 1, limit: 1 },
        );

        expect(getGraphLog).toHaveBeenCalledWith(3, ['main'], 'src', {
            search: 'fix',
            authors: ['Ada'],
            dateFrom: '2026-01-01',
            dateTo: '2026-01-02',
        }, undefined);
        expect(result.commits.map((item) => item.hash)).toEqual(['b2']);
        expect(result.currentBranch).toBe('main');
        expect(result.currentUser).toBe('Ada');
        expect(result.hasMore).toBe(true);
        expect(result.loadedCount).toBe(1);
        expect(result.totalCount).toBe(3);
        expect(result.hasRemotes).toBe(true);
    });

    it('keeps optional graph data failures as warnings', async () => {
        const dirtyWorktree = worktree('/repo-wt', 'a1', 'feature/wip');
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [commit('a1', 'feat(graph): base')]),
            getAllBranches: vi.fn(async () => [branch('main', true)]),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            getRemotes: vi.fn(async () => { throw new Error('remote unavailable'); }),
            listWorktrees: vi.fn(async () => [dirtyWorktree]),
            execRaw: vi.fn(async () => ' M changed.txt\0?? created.txt\0'),
        });

        const result = await new GetGraphDataUseCase().execute(repo, {}, { offset: 0, limit: 20 });

        expect(result.hasRemotes).toBe(false);
        expect(result.warnings.map((warning) => warning.operation)).toEqual(['graph/listRemotes']);
        expect(result.worktreeWips).toEqual([{
            path: '/repo-wt',
            head: 'a1',
            branch: 'feature/wip',
            staged: 0,
            unstaged: 1,
            untracked: 1,
            conflicts: 0,
        }]);
    });
});

function commit(hash: string, message: string): GitGraphCommit {
    return {
        hash,
        shortHash: hash,
        message,
        authorName: 'Ada',
        authorEmail: 'ada@example.com',
        authorDate: '2026-01-01T00:00:00Z',
        parentHashes: [],
        refs: [],
    };
}

function branch(name: string, isCurrent: boolean): GitBranch {
    return {
        name,
        isCurrent,
        isRemote: false,
        hash: 'a1',
        ahead: 0,
        behind: 0,
    };
}

function worktree(path: string, head: string, branchName: string): GitWorktree {
    return {
        path,
        head,
        branch: branchName,
        isMain: false,
        isDetached: false,
        isLocked: false,
    };
}
