import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch } from '@core/git/domain/git-status';
import type { GitTag } from '@core/git/domain/git-status';
import type { GitGraphCommit } from '@core/git/domain/git-commit';
import type { GitWorktree } from '@core/git/domain/git-worktree';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { GraphExtensionToWebviewMessage } from '@protocol/graph/messages';
import type { RepositoryLocator } from '@protocol/shared/repo';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { GetGraphDataUseCase, type GraphDataResult } from '@application/usecases/graph/get-graph-data';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('GraphMessageRouter', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

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

    it('returns paginated branch details from a real repository', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const parent = repo.commitFile('README.md', 'base\n', 'base commit');
        const head = repo.commitFile('src/app.ts', 'export const app = true;\n', 'feature commit');
        const context = repoContext({ id: 'repo-id', cwd: repo.cwd, kind: RepoKind.Main, label: 'repo' });
        const registry = runtimeRegistryForUnbornContext(context);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(
            { currentContext: context },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/branchDetailsRequest',
            requestId: 'branch-details-1',
            branch: 'main',
            page: { offset: 0, limit: 1 },
        });

        expect(messages).toContainEqual({
            type: 'graph/branchDetailsResponse',
            requestId: 'branch-details-1',
            page: { offset: 0, limit: 1 },
            details: expect.objectContaining({
                name: 'main',
                isRemote: false,
                isCurrent: true,
                head: expect.objectContaining({ hash: head, parentHashes: [parent] }),
                commits: [expect.objectContaining({ hash: head, message: 'feature commit' })],
                hasMore: true,
                loadedCount: 1,
            }),
        });
    });

    it('does not push graph data when a silent refresh returns the same snapshot', async () => {
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        const executeGraphData = vi.spyOn(getGraphData, 'execute').mockResolvedValue(graphDataResult());
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
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
        expect(executeGraphData).toHaveBeenCalledTimes(2);
    });

    it('responds with the default branch and WIP for an initialized repository without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('test.py', 'print("hello world")\n');
        const context = repoContext({ id: 'repo-id', cwd: repo.cwd, kind: RepoKind.Main, label: 'repo' });
        const registry = runtimeRegistryForUnbornContext(context);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(
            { currentContext: context },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-empty-main',
            repoId: context.id,
            filters: {},
            page: { offset: 0, limit: 300 },
        });

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'graph-empty-main',
            data: expect.objectContaining({
                commits: [],
                currentBranch: 'main',
                branches: expect.arrayContaining([
                    expect.objectContaining({ name: 'main', isCurrent: true, isRemote: false }),
                ]),
                worktreeWips: expect.arrayContaining([
                    expect.objectContaining({
                        path: repo.cwd,
                        branch: 'main',
                        staged: 0,
                        unstaged: 0,
                        untracked: 1,
                        conflicts: 0,
                    }),
                ]),
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
            }),
        }));
        expect(messages.some((message) => message.type === 'graph/error')).toBe(false);
    });

    it('responds with empty graph data for an initialized worktree context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = repoContext({ id: 'worktree-id', cwd: repo.cwd, kind: RepoKind.Worktree, parentId: 'repo-id', label: 'repo-worktree' });
        const registry = runtimeRegistryForUnbornContext(context);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(
            { currentContext: context },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-empty-worktree',
            repoId: context.id,
            filters: {},
            page: { offset: 0, limit: 300 },
        });

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'graph-empty-worktree',
            data: expect.objectContaining({
                commits: [],
                currentBranch: 'main',
                branches: expect.arrayContaining([
                    expect.objectContaining({ name: 'main', isCurrent: true, isRemote: false }),
                ]),
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
            }),
        }));
        expect(messages.some((message) => message.type === 'graph/error')).toBe(false);
    });

    it('responds with empty graph data for an initialized submodule context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = repoContext({ id: 'submodule-id', cwd: repo.cwd, kind: RepoKind.Submodule, parentId: 'repo-id', label: 'auth-kit' });
        const registry = runtimeRegistryForUnbornContext(context);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const repository = {
            repoId: context.id,
            kind: 'submodule',
            path: context.cwd,
            parentRepoId: context.parentId,
        } satisfies RepositoryLocator;
        const router = new GraphMessageRouter(
            { currentContext: repoContext({ id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' }) },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-empty-submodule',
            repoId: 'repo-id',
            repository,
            filters: {},
            page: { offset: 0, limit: 300 },
        });

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'graph-empty-submodule',
            data: expect.objectContaining({
                repository,
                commits: [],
                currentBranch: 'main',
                branches: expect.arrayContaining([
                    expect.objectContaining({ name: 'main', isCurrent: true, isRemote: false }),
                ]),
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
            }),
        }));
        expect(messages.some((message) => message.type === 'graph/error')).toBe(false);
    });

    it('resolves worktree WIPs for dirty registered worktrees through the runtime registry', async () => {
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, statusRuntime());
        registry.registerWorktree(new RuntimeWorktree({
            repoId: 'repo-id',
            worktreeId: 'clean-worktree-id',
            path: '/repo-clean',
            gitDir: '/repo-clean/.git',
            repositoryKind: 'main',
            isMain: false,
            head: 'def456',
            branch: 'feature/clean',
            dirty: false,
        }, statusRuntime()));
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        const executeGraphData = vi.spyOn(getGraphData, 'execute').mockResolvedValue(graphDataResult());
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
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

        const options = executeGraphData.mock.calls[0]?.[4];
        expect(options?.resolveWorktreeWips).toBeDefined();
        const wips = await options!.resolveWorktreeWips!([
            gitWorktree({ path: '/repo', head: 'abc123', branch: 'main', isMain: true }),
            gitWorktree({ path: '/repo-clean', head: 'def456', branch: 'feature/clean' }),
            gitWorktree({ path: '/repo-unregistered', head: '0123abc', branch: 'feature/orphan' }),
        ]);

        expect(wips).toEqual([{
            path: '/repo',
            head: 'abc123',
            branch: 'main',
            staged: 1,
            unstaged: 1,
            untracked: 1,
            conflicts: 1,
        }]);
    });

    it('resolves worktree WIPs for a submodule repository locator', async () => {
        const registry = new RepositoryRegistry();
        const runtime = statusRuntime('/repo/modules/auth-kit');
        registry.registerRepository(new RuntimeGitRepository({
            repoId: 'submodule-id',
            cwd: '/repo/modules/auth-kit',
            gitDir: '/repo/modules/auth-kit/.git',
            kind: 'submodule',
            label: 'auth-kit',
            parentRepositoryId: 'repo-id',
        }, runtime));
        registry.registerWorktree(new RuntimeWorktree({
            repoId: 'submodule-id',
            worktreeId: 'submodule-worktree-id',
            path: '/repo/modules/auth-kit',
            gitDir: '/repo/modules/auth-kit/.git',
            repositoryKind: 'submodule',
            parentRepositoryId: 'repo-id',
            isMain: true,
            head: 'sub123',
            branch: 'main',
            dirty: true,
        }, runtime));
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        const executeGraphData = vi.spyOn(getGraphData, 'execute').mockResolvedValue(graphDataResult());
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph:replace:0:0',
            repoId: 'repo-id',
            repository: {
                repoId: 'submodule-id',
                kind: 'submodule',
                path: '/repo/modules/auth-kit',
                parentRepoId: 'repo-id',
            },
            filters: {},
            page: { offset: 0, limit: 300 },
        });

        const options = executeGraphData.mock.calls[0]?.[4];
        expect(options?.resolveWorktreeWips).toBeDefined();
        const wips = await options!.resolveWorktreeWips!([
            gitWorktree({ path: '/repo/modules/auth-kit', head: 'sub123', branch: 'main', isMain: true }),
        ]);

        expect(wips).toEqual([{
            path: '/repo/modules/auth-kit',
            head: 'sub123',
            branch: 'main',
            staged: 1,
            unstaged: 1,
            untracked: 1,
            conflicts: 1,
        }]);
    });

    it('pushes graph data when a silent refresh returns a changed snapshot', async () => {
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        vi.spyOn(getGraphData, 'execute')
            .mockResolvedValueOnce(graphDataResult())
            .mockResolvedValueOnce(graphDataResult({
                commits: [commit({ hash: 'def456', shortHash: 'def456', message: 'change' })],
            }));
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
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

    it('pushes empty graph data instead of a runtime error after the active repository closes', async () => {
        const context = { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } satisfies RepoContext;
        const repositories: { currentContext: RepoContext | undefined } = { currentContext: context };
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        vi.spyOn(getGraphData, 'execute').mockResolvedValue(graphDataResult());
        const router = new GraphMessageRouter(
            repositories,
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph:replace:0:0',
            repoId: context.id,
            filters: {},
            page: { offset: 0, limit: 300 },
        });
        repositories.currentContext = undefined;
        registry.clear();

        await router.refreshGraphData();

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataPush',
            repoId: '',
            data: expect.objectContaining({ commits: [], branches: [], worktrees: [] }),
        }));
        expect(messages.some((message) => message.type === 'graph/error')).toBe(false);
    });

    it('cancels graph requests when the repository refresh cache is reset', async () => {
        const context = { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } satisfies RepoContext;
        const registry = new RepositoryRegistry();
        registerRuntimeRepository(registry, neverRuntime());
        const messages: GraphExtensionToWebviewMessage[] = [];
        const getGraphData = new GetGraphDataUseCase();
        let markRequestStarted: (() => void) | undefined;
        const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
        vi.spyOn(getGraphData, 'execute').mockImplementation(async (_repository, _filters, _page, signal) => {
            markRequestStarted?.();
            return new Promise<GraphDataResult>((_resolve, reject) => {
                signal?.addEventListener('abort', () => {
                    const error = new Error('Graph request was cancelled.');
                    error.name = 'AbortError';
                    reject(error);
                }, { once: true });
            });
        });
        const router = new GraphMessageRouter(
            { currentContext: context },
            (message) => { messages.push(message); },
            async () => {},
            getGraphData,
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        const request = router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph:replace:0:0',
            repoId: context.id,
            filters: {},
            page: { offset: 0, limit: 300 },
        });
        await requestStarted;

        router.resetRefreshCache();
        await request;

        expect(messages.some((message) => message.type === 'graph/dataResponse')).toBe(false);
        expect(messages.some((message) => message.type === 'graph/error')).toBe(false);
    });
});

function commitFromInput(input: unknown): string {
    if (typeof input === 'object' && input !== null && 'commit' in input && typeof input.commit === 'string') {
        return input.commit;
    }
    throw new Error('Expected commit input.');
}

function statusRuntime(dirtyCwd = '/repo'): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, context: GitExecutionContext, _input: TInput): Promise<TResult> {
            if (operation !== 'getStatus') { throw new Error(`Unexpected operation ${operation}`); }
            if (context.cwd === dirtyCwd) {
                return {
                    staged: [statusEntry('M', ' ', 'staged.txt')],
                    unstaged: [statusEntry(' ', 'M', 'modified.txt'), statusEntry('?', '?', 'untracked.txt')],
                    conflicts: [statusEntry('U', 'U', 'conflict.txt')],
                    conflictState: 'merge',
                } as TResult;
            }
            return { staged: [], unstaged: [], conflicts: [], conflictState: 'none' } as TResult;
        },
    };
}

function statusEntry(indexStatus: string, workTreeStatus: string, filePath: string) {
    return { indexStatus, workTreeStatus, filePath };
}

function gitWorktree(overrides: { path: string; head: string; branch: string | undefined; isMain?: boolean }): GitWorktree {
    return {
        path: overrides.path,
        head: overrides.head,
        branch: overrides.branch,
        isMain: overrides.isMain ?? false,
        isDetached: false,
        isLocked: false,
    };
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

function runtimeRegistryForUnbornContext(context: RepoContext): RepositoryRegistry {
    const registry = new RepositoryRegistry();
    const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
    const repoId = context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id;
    const repositoryKind = context.kind === RepoKind.Submodule ? 'submodule' : 'main';
    registry.registerRepository(new RuntimeGitRepository({
        repoId,
        cwd: context.cwd,
        gitDir: `${context.cwd}/.git`,
        kind: repositoryKind,
        label: context.label,
        parentRepositoryId: context.kind === RepoKind.Submodule ? context.parentId : undefined,
    }, runtime));
    registry.registerWorktree(new RuntimeWorktree({
        repoId,
        worktreeId: context.id,
        path: context.cwd,
        gitDir: `${context.cwd}/.git`,
        repositoryKind,
        parentRepositoryId: context.kind === RepoKind.Submodule ? context.parentId : undefined,
        isMain: context.kind !== RepoKind.Worktree,
        head: 'HEAD',
        branch: undefined,
        dirty: false,
    }, runtime));
    return registry;
}

function repoContext(context: RepoContext): RepoContext {
    return context;
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
