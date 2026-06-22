import { describe, expect, it } from 'vitest';
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
            stableRepoContextId('/repo/modules/auth-kit'),
        ]);
    });
});

function runtimeWithSubmodules(submodules: readonly GitSubmodule[]): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult([{
                        name: 'main',
                        isRemote: false,
                        isCurrent: true,
                        hash: 'abc123',
                        ahead: 0,
                        behind: 0,
                    }] satisfies readonly GitBranch[]);
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

function cleanStatus(): GitStatus {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
    };
}

function gitWorktree(path: string): GitWorktree {
    return {
        path,
        head: 'abc123',
        branch: 'refs/heads/main',
        isMain: true,
        isDetached: false,
        isLocked: false,
    };
}
