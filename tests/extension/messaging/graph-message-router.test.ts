import { describe, expect, it, vi } from 'vitest';
import { RepoKind } from '@core/git/domain/repo-context';
import type { GitBranch } from '@core/git/domain/git-status';
import type { GitTag } from '@core/git/domain/git-status';
import type { GitGraphCommit } from '@core/git/domain/git-commit';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { GraphExtensionToWebviewMessage } from '@protocol/graph/messages';
import type { RepositoryLocator } from '@protocol/shared/repo';
import type { GraphDataResult } from '@application/usecases/graph/get-graph-data';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';

describe('GraphMessageRouter', () => {
    it('resolves commit detail requests through repository locators', async () => {
        const calls: GitExecutionContext[] = [];
        const runtime: GitRuntime = {
            supports: () => true,
            async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, context: GitExecutionContext, input: TInput): Promise<TResult> {
                calls.push(context);
                if (operation === 'getCommitFiles') { return [] as TResult; } // Router test exercises this operation as a file-list result.
                if (operation === 'getCommitMessage') {
                    return `${context.repositoryId}:${commitFromInput(input)}` as TResult; // Router test exercises this operation as a message string.
                }
                throw new Error(`Unexpected operation ${operation}`);
            },
        };
        const registry = new RepositoryRegistry();
        const submoduleRepository = new RuntimeGitRepository({
            repoId: 'submodule-id',
            cwd: '/repo/modules/auth-kit',
            gitDir: '/repo/modules/auth-kit/.git',
            kind: 'submodule',
            label: 'auth-kit',
            parentRepositoryId: 'repo-id',
        }, runtime);
        registry.registerRepository(submoduleRepository);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const repository = {
            repoId: 'submodule-id',
            kind: 'submodule',
            path: '/repo/modules/auth-kit',
            parentRepoId: 'repo-id',
        } satisfies RepositoryLocator;
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/commitDetailsRequest',
            requestId: 'details-1',
            hash: 'abc123',
            repository,
        });

        expect(messages).toContainEqual({
            type: 'graph/commitDetailsResponse',
            requestId: 'details-1',
            hash: 'abc123',
            fullMessage: 'submodule-id:abc123',
            files: [],
        });
        expect(calls.map((call) => call.repositoryId)).toEqual(['submodule-id', 'submodule-id']);
    });

    it('does not push graph data when a silent refresh returns the same snapshot', async () => {
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = {
            execute: vi.fn(async () => graphDataResult()),
        };
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph:replace:0:0',
            repoId: 'repo-id',
            filters: {},
            page: { offset: 0, limit: 300 },
        });
        await router.refreshGraphData();

        expect(messages.filter((message) => message.type === 'graph/dataResponse')).toHaveLength(1);
        expect(messages.filter((message) => message.type === 'graph/dataPush')).toHaveLength(0);
        expect(getGraphData.execute).toHaveBeenCalledTimes(2);
    });

    it('pushes graph data when a silent refresh returns a changed snapshot', async () => {
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = {
            execute: vi.fn()
                .mockResolvedValueOnce(graphDataResult())
                .mockResolvedValueOnce(graphDataResult({
                    commits: [commit({ hash: 'def456', shortHash: 'def456', message: 'change' })],
                })),
        };
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph:replace:0:0',
            repoId: 'repo-id',
            filters: {},
            page: { offset: 0, limit: 300 },
        });
        await router.refreshGraphData();

        expect(messages.filter((message) => message.type === 'graph/dataResponse')).toHaveLength(1);
        expect(messages.filter((message) => message.type === 'graph/dataPush')).toHaveLength(1);
    });
});

function commitFromInput(input: unknown): string {
    if (typeof input === 'object' && input !== null && 'commit' in input && typeof input.commit === 'string') {
        return input.commit;
    }
    throw new Error('Expected commit input.');
}

function neverRuntime(): GitRuntime {
    return {
        supports: () => false,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, _input: TInput): Promise<TResult> {
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function registerRuntimeRepository(registry: RepositoryRegistry, runtime: GitRuntime): void {
    registry.registerRepository(new RuntimeGitRepository({
        repoId: 'repo-id',
        cwd: '/repo',
        gitDir: '/repo/.git',
        kind: 'main',
        label: 'repo',
    }, runtime));
    registry.registerWorktree(new RuntimeWorktree({
        repoId: 'repo-id',
        worktreeId: 'repo-id',
        path: '/repo',
        gitDir: '/repo/.git',
        repositoryKind: 'main',
        isMain: true,
        head: 'abc123',
        branch: 'main',
        dirty: false,
    }, runtime));
}

function graphDataResult(overrides: Partial<GraphDataResult> = {}): GraphDataResult {
    return {
        branches: [branch()],
        tags: [] satisfies readonly GitTag[],
        commits: [commit()],
        currentBranchCommitHashes: ['abc123'],
        currentBranch: 'main',
        currentUser: 'Mathias',
        hasMore: false,
        loadedCount: overrides.commits?.length ?? 1,
        totalCount: overrides.commits?.length ?? 1,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
        submodules: [],
        warnings: [],
        ...overrides,
    };
}

function branch(): GitBranch {
    return {
        name: 'main',
        isRemote: false,
        isCurrent: true,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
    };
}

function commit(overrides: Partial<GitGraphCommit> = {}): GitGraphCommit {
    return {
        hash: 'abc123',
        shortHash: 'abc123',
        message: 'initial',
        authorName: 'Mathias',
        authorEmail: 'mathias@example.com',
        authorDate: '2026-06-21T00:00:00.000Z',
        parentHashes: [],
        refs: [],
        ...overrides,
    };
}
