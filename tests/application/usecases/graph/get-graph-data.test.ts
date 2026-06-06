import { describe, expect, it, vi } from 'vitest';
import { GetGraphDataUseCase } from '../../../../src/application/usecases/graph/get-graph-data';
import type { GitGraphCommit } from '../../../../src/core/git/domain/GitCommit';
import type { GitBranch } from '../../../../src/core/git/domain/GitStatus';
import type { GitSubmodule, GitWorktree } from '../../../../src/core/git/domain/GitWorktree';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GetGraphDataUseCase', () => {
    it('passes graph filters to the repository and paginates commits', async () => {
        const commits = [
            commit('a1', 'feat(graph): first'),
            commit('b2', 'fix(graph): second'),
            commit('c3', 'test(graph): third'),
        ];
        const branches = [branch('main', true)];
        const getGraphLog = vi.fn(async () => commits.slice(1));
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
            { authors: ['Ada'], dateFrom: '2026-01-01', dateTo: '2026-01-02', path: 'src', branches: ['main'] },
            { offset: 1, limit: 1 },
        );

        expect(getGraphLog).toHaveBeenCalledWith(2, ['main'], 'src', {
            search: undefined,
            authors: ['Ada'],
            dateFrom: '2026-01-01',
            dateTo: '2026-01-02',
            skip: 1,
        }, undefined);
        expect(result.commits.map((item) => item.hash)).toEqual(['b2']);
        expect(result.currentBranch).toBe('main');
        expect(result.currentUser).toBe('Ada');
        expect(result.hasMore).toBe(true);
        expect(result.loadedCount).toBe(2);
        expect(result.totalCount).toBe(3);
        expect(result.hasRemotes).toBe(true);
    });

    it('keeps prefix pagination for searched graph data so local search context stays stable', async () => {
        const commits = [
            commit('a1', 'feat(graph): first'),
            commit('b2', 'fix(graph): second'),
            commit('c3', 'test(graph): third'),
        ];
        const getGraphLog = vi.fn(async () => commits);
        const repo = makeRepositoryMock({
            getGraphLog,
            getAllBranches: vi.fn(async () => [branch('main', true)]),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            listWorktrees: vi.fn(async () => []),
        });

        const result = await new GetGraphDataUseCase().execute(
            repo,
            { search: 'fix' },
            { offset: 1, limit: 1 },
        );

        expect(getGraphLog).toHaveBeenCalledWith(3, undefined, undefined, {
            search: 'fix',
            authors: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            skip: 0,
        }, undefined);
        expect(result.commits.map((item) => item.hash)).toEqual(['b2']);
        expect(result.loadedCount).toBe(2);
        expect(result.hasMore).toBe(true);
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

    it('loads submodule branches and worktrees from the submodule repository', async () => {
        const exec = vi.fn(async (args: readonly string[]) => {
            if (args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD') { return 'feature/oauth'; }
            return '';
        });
        const execRaw = vi.fn(async (args: readonly string[]) => {
            if (args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'for-each-ref') {
                return [
                    'refs/heads/main\0a1\0\0',
                    'refs/heads/feature/oauth\0b2\0origin/feature/oauth\0[ahead 1]',
                    'refs/remotes/origin/main\0a1\0\0',
                ].join('\n');
            }
            if (args.join(' ') === '-C modules/auth-kit worktree list --porcelain') {
                return [
                    'worktree /workspace/modules/auth-kit',
                    'HEAD b2',
                    'branch refs/heads/feature/oauth',
                    '',
                    'worktree /workspace/.worktrees/auth-release',
                    'HEAD c3',
                    'branch refs/heads/release/1.4',
                ].join('\n');
            }
            return '';
        });
        const repo = makeRepositoryMock({
            exec,
            execRaw,
            getGraphLog: vi.fn(async () => [commit('a1', 'feat(graph): base')]),
            getAllBranches: vi.fn(async () => [branch('main', true)]),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            listWorktrees: vi.fn(async () => []),
            getSubmoduleStatus: vi.fn(async () => [
                submodule('modules/auth-kit', '+'),
                submodule('modules/not-initialized', '-'),
            ]),
        });

        const result = await new GetGraphDataUseCase().execute(repo, {}, { offset: 0, limit: 20 });

        expect(result.submodules).toHaveLength(2);
        expect(result.submodules[0]).toMatchObject({
            path: 'modules/auth-kit',
            status: '+',
            branches: [
                { name: 'main', isCurrent: false, isRemote: false },
                { name: 'feature/oauth', isCurrent: true, isRemote: false, ahead: 1 },
                { name: 'origin/main', isCurrent: false, isRemote: true },
            ],
            worktrees: [
                { path: '/workspace/modules/auth-kit', branch: 'refs/heads/feature/oauth', isMain: true },
                { path: '/workspace/.worktrees/auth-release', branch: 'refs/heads/release/1.4', isMain: false },
            ],
        });
        expect(result.submodules[1]).toEqual({
            path: 'modules/not-initialized',
            status: '-',
            branches: [],
            worktrees: [],
        });
        expect(execRaw).not.toHaveBeenCalledWith(expect.arrayContaining(['modules/not-initialized']), expect.anything());
    });

    it('can defer submodule branch and worktree loading', async () => {
        const execRaw = vi.fn(async () => '');
        const repo = makeRepositoryMock({
            execRaw,
            getGraphLog: vi.fn(async () => [commit('a1', 'feat(graph): base')]),
            getAllBranches: vi.fn(async () => [branch('main', true)]),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            listWorktrees: vi.fn(async () => []),
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', '+')]),
        });

        const result = await new GetGraphDataUseCase().execute(
            repo,
            {},
            { offset: 0, limit: 20 },
            undefined,
            { includeSubmoduleRepositories: false },
        );

        expect(result.submodules).toEqual([{
            path: 'modules/auth-kit',
            status: '+',
            branches: [],
            worktrees: [],
        }]);
        expect(execRaw).not.toHaveBeenCalledWith(expect.arrayContaining(['-C', 'modules/auth-kit', 'for-each-ref']), expect.anything());
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

function submodule(path: string, status: GitSubmodule['status']): GitSubmodule {
    return { path, status };
}
