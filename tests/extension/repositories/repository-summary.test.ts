import { describe, expect, it } from 'vitest';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitSubmodule, GitWorktree } from '@core/git/domain/git-worktree';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { RepositorySummaryService } from '@extension/repositories/repository-summary';
import { samePath } from '@tests/helpers/git-repo';

describe('RepositorySummaryService', () => {
    it('summarizes repository state for the navigator overview', async () => {
        const context = createRepoContext('/repo');
        const service = new RepositorySummaryService(new RuntimeRepositoryFactory(recordingRuntime({
            branches: [
                branch('main', { current: true, upstream: 'origin/main' }),
                branch('feature/auth'),
                branch('origin/main', { remote: true }),
            ],
            remotes: ['origin'],
            submodules: [{ path: 'modules/auth-kit', status: ' ' }],
            worktrees: [
                worktree('/repo'),
                worktree('/repo-feature'),
                worktree('/repo-prunable', { prunable: true }),
            ],
            status: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' }],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: 'merge',
            },
        })));

        await expect(service.summarize([context])).resolves.toEqual([{
            context: { id: context.id, cwd: context.cwd, kind: 'main', label: context.label, parentId: undefined },
            branch: 'main',
            upstream: 'origin/main',
            hasRemote: true,
            branchCount: 2,
            submoduleCount: 1,
            worktreeCount: 2,
            stagedCount: 1,
            unstagedCount: 1,
            conflictCount: 1,
        }]);
    });

    it('summarizes multiple repositories independently', async () => {
        const first = createRepoContext('/repo-a');
        const second = createRepoContext('/repo-b');
        const service = new RepositorySummaryService(new RuntimeRepositoryFactory(recordingRuntime({
            branches: [branch('main', { current: true })],
            remotes: [],
            submodules: [],
            worktrees: [worktree('/repo-a')],
            status: cleanStatus(),
        })));

        const summaries = await service.summarize([first, second]);

        expect(summaries.map((summary) => summary.context.id)).toEqual([first.id, second.id]);
        expect(summaries.map((summary) => summary.hasRemote)).toEqual([false, false]);
    });
});

interface RuntimeState {
    readonly branches: readonly GitBranch[];
    readonly remotes: readonly string[];
    readonly submodules: readonly GitSubmodule[];
    readonly worktrees: readonly GitWorktree[];
    readonly status: GitStatus;
}

function recordingRuntime(state: RuntimeState): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(state.branches);
                case 'listRemotes':
                    return runtimeResult(state.remotes);
                case 'listSubmodules':
                    return runtimeResult(state.submodules);
                case 'listWorktrees':
                    return runtimeResult(worktreesForContext(state.worktrees, context.cwd));
                case 'getStatus':
                    return runtimeResult(state.status);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function worktreesForContext(worktrees: readonly GitWorktree[], cwd: string): readonly GitWorktree[] {
    return worktrees.some((worktree) => samePath(worktree.path, cwd))
        ? worktrees
        : [worktree(cwd)];
}

function branch(name: string, options: { readonly current?: boolean; readonly remote?: boolean; readonly upstream?: string } = {}): GitBranch {
    return {
        name,
        isCurrent: options.current ?? false,
        isRemote: options.remote ?? false,
        upstream: options.upstream,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
    };
}

function worktree(path: string, options: { readonly prunable?: boolean } = {}): GitWorktree {
    return {
        path,
        head: 'abc123',
        branch: 'refs/heads/main',
        isMain: true,
        isDetached: false,
        isLocked: false,
        isPrunable: options.prunable,
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

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // GitRuntime.execute is generic at call sites; this fixture returns values matched to each operation.
}
