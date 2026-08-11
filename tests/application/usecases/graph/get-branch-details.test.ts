import { describe, expect, it, vi } from 'vitest';
import { GetBranchDetailsUseCase, type BranchDetailsRepository } from '@application/usecases/graph/get-branch-details';
import { GitCommit } from '@core/git/domain/git-commit';
import { Page } from '@core/git/domain/page';

describe('GetBranchDetailsUseCase', () => {
    it('loads branch metadata, HEAD, and a bounded commit page', async () => {
        const head = commit('head', ['parent']);
        const repository = {
            listBranches: vi.fn(async () => [{
                name: 'feature/auth',
                isRemote: false,
                isCurrent: true,
                hash: head.hash,
                upstream: 'company/origin/feature/auth',
                ahead: 2,
                behind: 1,
            }]),
            listRemotes: vi.fn(async () => ['company', 'company/origin']),
            getRemoteUrl: vi.fn(async () => 'ssh://git@example.test/team/repo.git'),
            getCommitDetails: vi.fn(async () => head),
            getCommitGraph: vi.fn(async () => new Page([head], true, '1')),
        } satisfies BranchDetailsRepository;
        const signal = new AbortController().signal;

        const result = await new GetBranchDetailsUseCase().execute(
            repository,
            'feature/auth',
            { limit: 1 },
            signal,
        );

        expect(result.branch.name).toBe('feature/auth');
        expect(result.remote).toBe('company/origin');
        expect(result.remoteUrl).toBe('ssh://git@example.test/team/repo.git');
        expect(result.head?.parentHashes).toEqual(['parent']);
        expect(result.commits).toEqual(expect.objectContaining({ items: [head], hasMore: true }));
        expect(repository.getCommitGraph).toHaveBeenCalledWith(
            { branches: ['feature/auth'] },
            { limit: 1 },
            signal,
        );
    });

    it('supports an unborn branch without querying commit history', async () => {
        const repository = {
            listBranches: vi.fn(async () => [{
                name: 'main',
                isRemote: false,
                isCurrent: true,
                hash: '',
                ahead: 0,
                behind: 0,
            }]),
            listRemotes: vi.fn(async () => []),
            getRemoteUrl: vi.fn(async () => 'unexpected'),
            getCommitDetails: vi.fn(async () => commit('unexpected')),
            getCommitGraph: vi.fn(async () => new Page([], false)),
        } satisfies BranchDetailsRepository;

        const result = await new GetBranchDetailsUseCase().execute(repository, 'main', { limit: 20 });

        expect(result.head).toBeUndefined();
        expect(result.commits.items).toEqual([]);
        expect(repository.getCommitDetails).not.toHaveBeenCalled();
        expect(repository.getCommitGraph).not.toHaveBeenCalled();
        expect(repository.getRemoteUrl).not.toHaveBeenCalled();
    });

    it('rejects a branch that no longer exists', async () => {
        const repository = {
            listBranches: vi.fn(async () => []),
            listRemotes: vi.fn(async () => []),
            getRemoteUrl: vi.fn(async () => 'unexpected'),
            getCommitDetails: vi.fn(async () => commit('unexpected')),
            getCommitGraph: vi.fn(async () => new Page([], false)),
        } satisfies BranchDetailsRepository;

        await expect(new GetBranchDetailsUseCase().execute(repository, 'deleted', { limit: 20 }))
            .rejects.toThrow('Branch "deleted" was not found.');
    });
});

function commit(hash: string, parentHashes: readonly string[] = []): GitCommit {
    return new GitCommit({
        hash,
        shortHash: hash.slice(0, 7),
        message: `commit ${hash}`,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2026-08-11T10:00:00Z',
        parentHashes,
    });
}
