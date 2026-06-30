import { describe, expect, it } from 'vitest';
import * as path from 'path';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitSubmodule, GitWorktree } from '@core/git/domain/git-worktree';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { RepositoryRuntimeRegistrar } from '@extension/repositories/repository-runtime-registrar';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

describe('RepositoryRuntimeRegistrar', () => {
    it('refreshes worktrees in the registry without re-creating the repository', async () => {
        const linkedWorktreePath = '/repo-worktrees/feature';
        const runtime = runtimeWithLinkedWorktrees([]);
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
        const context = createRepoContext('/repo');

        await registrar.registerContext(registry, context);
        expect(registry.worktrees(context.id)).toHaveLength(1);

        runtime.linkedWorktrees = [gitWorktree(linkedWorktreePath, false)];
        await registrar.refreshWorktrees(registry, context);

        const worktrees = registry.worktrees(context.id);
        expect(worktrees).toHaveLength(2);
        expect(worktrees.some((w) => w.path === linkedWorktreePath)).toBe(true);
        expect(registry.resolveRepository({ repoId: context.id, kind: 'main', path: '/repo' })).toBeDefined();
    });

    it('registers the selected repository and initialized submodule repositories', async () => {
        const runtime = runtimeWithSubmodules([
            { path: 'modules/auth-kit', status: ' ' },
        ]);
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
        const context = createRepoContext('/repo');

        await registrar.registerContext(registry, context);

        expect(registry.repositories().map((repo) => repo.repoId)).toEqual([
            context.id,
            stableRepoContextId(path.resolve(context.cwd, 'modules/auth-kit')),
        ]);
    });
});

interface MutableLinkedWorktreeRuntime extends GitRuntime {
    linkedWorktrees: GitWorktree[];
}

function runtimeWithLinkedWorktrees(linked: GitWorktree[]): MutableLinkedWorktreeRuntime {
    const rt: MutableLinkedWorktreeRuntime = {
        linkedWorktrees: linked,
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(defaultBranches());
                case 'getStatus':
                    return runtimeResult(cleanStatus());
                case 'listWorktrees':
                    return runtimeResult([gitWorktree(context.cwd), ...rt.linkedWorktrees]);
                case 'listSubmodules':
                    return runtimeResult([]);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
    return rt;
}

function runtimeWithSubmodules(submodules: readonly GitSubmodule[]): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(defaultBranches());
                case 'getStatus':
                    return runtimeResult(cleanStatus());
                case 'listWorktrees':
                    return runtimeResult([gitWorktree(context.cwd)]);
                case 'listSubmodules':
                    return runtimeResult(submodules);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // GitRuntime.execute is generic at call sites; this test fixture returns values matched to each requested operation.
}

function defaultBranches(): readonly GitBranch[] {
    return [{
        name: 'main',
        isRemote: false,
        isCurrent: true,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
    }];
}

function cleanStatus(): GitStatus {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
    };
}

function gitWorktree(worktreePath: string, isMain = true): GitWorktree {
    return {
        path: worktreePath,
        head: 'abc123',
        branch: isMain ? 'refs/heads/main' : 'refs/heads/feature',
        isMain,
        isDetached: false,
        isLocked: false,
    };
}
