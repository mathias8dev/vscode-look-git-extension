import { describe, expect, it } from 'vitest';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { RepoKind, type RepoContext } from '@core/git/domain/RepoContext';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { GitStatus } from '@core/git/domain/GitStatus';
import type { GitWorktree } from '@core/git/domain/GitWorktree';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

describe('RuntimeRepositoryFactory', () => {
    it('creates runtime repositories from repository contexts', async () => {
        const runtime = runtimeWith();
        const factory = new RuntimeRepositoryFactory(runtime);
        const repository = factory.createRepository({
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(repository).toMatchObject({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
            runtime,
        });
    });

    it('creates runtime worktrees with head, branch, and dirty facts', async () => {
        const runtime = runtimeWith({
            statusByCwd: {
                '/repo': {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'a.ts' }],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                },
            },
        });
        const factory = new RuntimeRepositoryFactory(runtime);
        const worktree = await factory.createMainWorktree({
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(worktree).toMatchObject({
            repoId: 'repo',
            worktreeId: 'repo',
            path: '/repo',
            isMain: true,
            head: 'abc123',
            branch: 'main',
            dirty: true,
            runtime,
        });
    });

    it('uses parent repository id for linked worktree contexts', async () => {
        const runtime = runtimeWith();
        const factory = new RuntimeRepositoryFactory(runtime);
        const context = {
            id: 'worktree',
            cwd: '/repo-linked',
            kind: RepoKind.Worktree,
            parentId: 'repo',
            label: 'repo-linked',
        } satisfies RepoContext;

        const repository = factory.createRepository(context);
        const worktree = await factory.createMainWorktree(context);

        expect(repository.repoId).toBe('repo');
        expect(worktree.repoId).toBe('repo');
        expect(worktree.worktreeId).toBe('worktree');
        expect(worktree.isMain).toBe(false);
    });

    it('creates runtime worktrees for linked worktrees discovered from the repository', async () => {
        const runtime = runtimeWith({
            worktrees: [
                gitWorktree('/repo', 'abc123', 'refs/heads/main', true),
                gitWorktree('/repo-linked', 'def456', 'refs/heads/feature/linked', false),
            ],
            statusByCwd: {
                '/repo-linked': {
                    staged: [],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'linked.ts' }],
                    conflicts: [],
                    conflictState: 'none',
                },
            },
        });
        const factory = new RuntimeRepositoryFactory(runtime);
        const worktrees = await factory.createWorktrees({
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(worktrees).toHaveLength(2);
        expect(worktrees[1]).toMatchObject({
            repoId: 'repo',
            worktreeId: stableRepoContextId('/repo-linked'),
            path: '/repo-linked',
            isMain: false,
            head: 'def456',
            branch: 'refs/heads/feature/linked',
            dirty: true,
            runtime,
        });
    });

    it('maps submodule contexts to submodule repositories', async () => {
        const runtime = runtimeWith();
        const factory = new RuntimeRepositoryFactory(runtime);
        const repository = factory.createRepository({
            id: 'sub',
            cwd: '/repo/sub',
            kind: RepoKind.Submodule,
            parentId: 'repo',
            label: 'sub',
        });

        expect(repository).toMatchObject({
            repoId: 'sub',
            kind: 'submodule',
        });
    });
});

function runtimeWith(overrides: Partial<{
    readonly headByCwd: Readonly<Record<string, string>>;
    readonly currentBranchByCwd: Readonly<Record<string, string>>;
    readonly statusByCwd: Readonly<Record<string, GitStatus>>;
    readonly worktrees: readonly GitWorktree[];
}> = {}): GitRuntime {
    return {
        supports: () => true,
        execute: async <TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext, _input: TInput): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return (overrides.headByCwd?.[context.cwd] ?? 'abc123') as TResult;
                case 'listBranches':
                    return [{
                        name: overrides.currentBranchByCwd?.[context.cwd] ?? 'main',
                        isRemote: false,
                        isCurrent: true,
                        hash: overrides.headByCwd?.[context.cwd] ?? 'abc123',
                        ahead: 0,
                        behind: 0,
                    }] as TResult;
                case 'getStatus':
                    return (overrides.statusByCwd?.[context.cwd] ?? cleanStatus()) as TResult;
                case 'listWorktrees':
                    return (overrides.worktrees ?? []) as TResult;
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function cleanStatus(): GitStatus {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
    };
}

function gitWorktree(path: string, head: string, branch: string | undefined, isMain: boolean): GitWorktree {
    return {
        path,
        head,
        branch,
        isMain,
        isDetached: branch === undefined,
        isLocked: false,
    };
}
