import { describe, expect, it } from 'vitest';
import type { GitBranch } from '@core/git/domain/git-status';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { CheckoutBranchUseCase } from '@application/usecases/branches/checkout-branch';

describe('CheckoutBranchUseCase', () => {
    it('checks out local branches directly', async () => {
        const calls = checkoutCalls();
        const useCase = new CheckoutBranchUseCase();

        await useCase.execute(repositoryDouble([branch({ name: 'main' })], calls), worktreeDouble(calls), { branch: 'main', isRemote: false });

        expect(calls.checkout).toEqual(['main']);
        expect(calls.checkoutNewBranch).toEqual([]);
        expect(calls.setUpstream).toEqual([]);
    });

    it('checks out an existing local tracking branch for remote branches', async () => {
        const calls = checkoutCalls();
        const useCase = new CheckoutBranchUseCase();

        await useCase.execute(repositoryDouble([
            branch({ name: 'feature/login', upstream: 'origin/feature/login' }),
            branch({ name: 'origin/feature/login', isRemote: true }),
        ], calls), worktreeDouble(calls), { branch: 'origin/feature/login', isRemote: true });

        expect(calls.checkout).toEqual(['feature/login']);
        expect(calls.checkoutNewBranch).toEqual([]);
        expect(calls.setUpstream).toEqual([]);
    });

    it('creates a local tracking branch when checking out a remote branch without a local branch', async () => {
        const calls = checkoutCalls();
        const useCase = new CheckoutBranchUseCase();

        await useCase.execute(repositoryDouble([
            branch({ name: 'origin/feature/login', isRemote: true }),
        ], calls), worktreeDouble(calls), { branch: 'origin/feature/login', isRemote: true });

        expect(calls.checkout).toEqual([]);
        expect(calls.checkoutNewBranch).toEqual([{ name: 'feature/login', startPoint: 'origin/feature/login' }]);
        expect(calls.setUpstream).toEqual([{ branch: 'feature/login', upstream: 'origin/feature/login' }]);
    });

    it('uses an existing same-name local branch instead of detaching at the remote ref', async () => {
        const calls = checkoutCalls();
        const useCase = new CheckoutBranchUseCase();

        await useCase.execute(repositoryDouble([
            branch({ name: 'feature/login' }),
            branch({ name: 'origin/feature/login', isRemote: true }),
        ], calls), worktreeDouble(calls), { branch: 'origin/feature/login', isRemote: true });

        expect(calls.checkout).toEqual(['feature/login']);
        expect(calls.checkoutNewBranch).toEqual([]);
        expect(calls.setUpstream).toEqual([]);
    });
});

interface CheckoutCalls {
    readonly checkout: string[];
    readonly checkoutNewBranch: Array<{ readonly name: string; readonly startPoint: string | undefined }>;
    readonly setUpstream: Array<{ readonly branch: string; readonly upstream: string }>;
}

function checkoutCalls(): CheckoutCalls {
    return {
        checkout: [],
        checkoutNewBranch: [],
        setUpstream: [],
    };
}

function branch(overrides: Partial<GitBranch>): GitBranch {
    return {
        name: 'main',
        isRemote: false,
        isCurrent: false,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
        ...overrides,
    };
}

function repositoryDouble(branches: readonly GitBranch[], calls: CheckoutCalls): GitRepository {
    return {
        repoId: 'repo-id',
        cwd: '/repo',
        gitDir: '/repo/.git',
        kind: 'main',
        label: 'repo',
        runtime: runtimeDouble,
        listBranches: async () => branches,
        setUpstream: async (branchName: string, upstream: string) => {
            calls.setUpstream.push({ branch: branchName, upstream });
        },
    } as unknown as GitRepository; // Test double only implements CheckoutBranchUseCase collaborators.
}

function worktreeDouble(calls: CheckoutCalls): Worktree {
    return {
        worktreeId: 'worktree-id',
        repoId: 'repo-id',
        path: '/repo',
        isMain: true,
        head: 'abc123',
        dirty: false,
        runtime: runtimeDouble,
        checkout: async (ref: string) => {
            calls.checkout.push(ref);
        },
        checkoutNewBranch: async (name: string, startPoint: string | undefined) => {
            calls.checkoutNewBranch.push({ name, startPoint });
        },
    } as unknown as Worktree; // Test double only implements CheckoutBranchUseCase collaborators.
}

const runtimeDouble = {
    supports: (_operation: SemanticGitOperation, _context: GitExecutionContext) => false,
    async execute<TInput = unknown, TResult = unknown>(
        _operation: SemanticGitOperation,
        _context: GitExecutionContext,
        _input: TInput,
    ): Promise<TResult> {
        throw new Error('Unexpected runtime call.');
    },
} satisfies GitRuntime;
