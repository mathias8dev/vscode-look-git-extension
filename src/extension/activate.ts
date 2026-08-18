import * as vscode from 'vscode';
import { registerGitBlameAnnotationsCommand } from '@extension/commands/git-blame-annotations-command';
import { registerResetExtensionStateCommand } from '@extension/commands/reset-extension-state-command';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { HybridGitRuntime } from '@extension/git/hybrid-git-runtime';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { VscodeGitRemoteRuntime } from '@extension/git/vscode-git-remote-runtime';
import { RepositoryRuntimeRegistrar } from '@extension/repositories/repository-runtime-registrar';
import { RepositoryNavigationCoordinator } from '@extension/repositories/repository-navigation-coordinator';
import { RepositorySelectionStore } from '@extension/repositories/repository-selection-store';
import { discoverChildRepositoryContexts, discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { getRepositoryScanMaxDepth, registerRepositoryScanMaxDepthListener } from '@extension/repositories/repository-discovery-settings';
import { RepositorySummaryService } from '@extension/repositories/repository-summary';
import { RepositoryRefreshCoordinator } from '@extension/repositories/repository-refresh-coordinator';
import { registerRuntimeContextWithRecovery } from '@extension/repositories/runtime-registration-recovery';
import { ChangesViewProvider } from '@extension/views/changes-view-provider';
import { CommitHistoryViewProvider } from '@extension/views/commit-history-view-provider';
import { GraphViewProvider } from '@extension/views/graph-view-provider';
import { registerReadonlyDiffDocumentProvider } from '@extension/utils/readonly-diff-documents';
import { registerGitBlobDocumentProvider } from '@extension/utils/git-blob-documents';
import { registerWebviewFontSizeSync } from '@extension/views/webview-font';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { appendErrorToOutput } from '@extension/messaging/error-output-channel';
import { migrateLookGitStorage } from '@extension/storage/look-git-storage';
import { RepositoryGitWatcher } from '@extension/watchers/repository-git-watcher';
import { RepositoryDiscoveryWatcher } from '@extension/watchers/repository-discovery-watcher';
import type { RepoContext } from '@core/git/domain/repo-context';
import type { Resource } from '@protocol/shared/base';
import type { RepositoriesChangedPush, RepositoryNavigationMessage, RepositorySummary } from '@protocol/shared/repo';
import { createErrorPayload, isAbortError } from '@extension/messaging/error-serialization';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await migrateLookGitStorage(context);

    /*
     * Ce qui change :
     * - HybridGitRuntime essaie maintenant le runtime suivant si un backend lève UnsupportedGitOperationError.
     * - VscodeGitRemoteRuntime est ajouté avant le CLI dans activate.ts.
     * - Les remote ops publiques VS Code Git passent par vscode.git, donc bénéficient de son auth/askpass UI :
     *   - fetch
     *   - fetchAll
     *   - pull simple
     *   - push
     *   - pushBranch
     *   - forcePushWithLease
     */
    const gitRuntime = new HybridGitRuntime([
        new VscodeGitRemoteRuntime(),
        new CliGitRuntime((args, runtimeContext, options) =>
            new GitCliBackend(runtimeContext.cwd).run(args, options)),
    ]);
    const repositories = new RepositorySelectionStore();
    const runtimeRegistrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(gitRuntime));
    const repositorySummaryService = new RepositorySummaryService(new RuntimeRepositoryFactory(gitRuntime));
    const runtimeRepositories = new RepositoryRegistry();
    let repositoriesResource: Resource<readonly RepositorySummary[]> = { status: 'loading' };
    let navigatedRepositoryContextId: string | undefined;
    let hasExplicitRepositoryNavigation = false;
    let activeRuntimeContextId: string | undefined;
    let repositoryStateGeneration = 0;
    let dynamicRepositoryContexts = new Map<string, RepoContext>();
    const childDiscoveryInFlight = new Map<string, Promise<void>>();
    async function handleRepositoryNavigation(message: RepositoryNavigationMessage): Promise<void> {
        switch (message.type) {
            case 'repo/navigateRepository':
                if (message.contextId && !repositories.contexts.some((contextItem) => contextItem.id === message.contextId)) { return; }
                hasExplicitRepositoryNavigation = true;
                navigatedRepositoryContextId = message.contextId;
                repositories.selectContext(message.contextId);
                return;
            case 'repo/openRepositoryInNewWindow': {
                const repository = repositories.contexts.find((contextItem) => contextItem.id === message.contextId);
                if (!repository) { return; }
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repository.cwd), true);
                return;
            }
        }
    }
    function refreshAll(): Promise<void> {
        return repositoryRefreshCoordinator.refresh();
    }
    const graphProvider = new GraphViewProvider(context.extensionUri, repositories, refreshAll, context.globalStorageUri, runtimeRepositories, handleRepositoryNavigation, async () => isRuntimeReadyForCurrentContext());
    const changesProvider = new ChangesViewProvider(context.extensionUri, repositories, refreshAll, undefined, undefined, undefined, undefined, runtimeRepositories, undefined, async () => isRuntimeReadyForCurrentContext(), handleRepositoryNavigation);
    const commitHistoryProvider = new CommitHistoryViewProvider(context.extensionUri, repositories, refreshAll, context.globalStorageUri, undefined, runtimeRepositories, handleRepositoryNavigation, async () => isRuntimeReadyForCurrentContext());
    const repositoryRefreshCoordinator = new RepositoryRefreshCoordinator({
        isReady: isRuntimeReadyForCurrentContext,
        refreshRuntime: async () => {
            const currentContext = repositories.currentContext;
            if (currentContext) {
                try {
                    await runtimeRegistrar.refreshWorktrees(runtimeRepositories, currentContext);
                } catch (error) {
                    appendErrorToOutput(createErrorPayload(error, {
                        code: 'gitOperationFailed',
                        operation: 'runtimeRepositoryRefresh',
                        recoverable: true,
                    }).error, 'runtimeRepositoryRefresh');
                }
            }
        },
        refreshViews: async () => {
            await Promise.all([
                changesProvider.refresh(),
                commitHistoryProvider.refresh(),
                graphProvider.refresh(),
            ]);
        },
    });

    const DEBOUNCE_MS = 150;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let repositoryDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;

    function debouncedRefreshAll(): void {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            void refreshAll();
        }, DEBOUNCE_MS);
    }

    function debouncedSyncDiscoveredRepositories(): void {
        if (repositoryDiscoveryTimer) { clearTimeout(repositoryDiscoveryTimer); }
        repositoryDiscoveryTimer = setTimeout(() => {
            void syncDiscoveredRepositories().then(syncActiveRepo);
        }, DEBOUNCE_MS);
    }

    const gitWatcher = new RepositoryGitWatcher(debouncedRefreshAll);
    const repositoryDiscoveryWatcher = new RepositoryDiscoveryWatcher(debouncedSyncDiscoveredRepositories);

    function repositoriesChangedMessage(): RepositoriesChangedPush {
        return {
            type: 'repo/repositoriesChanged',
            repositories: repositoriesResource,
            activeContextId: { status: 'ready', data: activeNavigatorContextId() },
        };
    }

    function activeNavigatorContextId(): string | undefined {
        const currentContext = repositories.currentContext;
        if (hasExplicitRepositoryNavigation) {
            return navigatedRepositoryContextId;
        }
        if (currentContext && activeRuntimeContextId !== currentContext.id) {
            return undefined;
        }
        if (repositories.soleTopLevelContext) {
            return currentContext?.id;
        }
        return undefined;
    }

    function notifyRepositoriesChanged(): void {
        const message = repositoriesChangedMessage();
        changesProvider.notifyRepositoriesChanged(message);
        commitHistoryProvider.notifyRepositoriesChanged(message);
        graphProvider.notifyRepositoriesChanged(message);
    }

    function isRuntimeReadyForCurrentContext(): boolean {
        const currentContext = repositories.currentContext;
        return currentContext ? activeRuntimeContextId === currentContext.id : true;
    }

    function syncActiveRepo(): void {
        if (hasExplicitRepositoryNavigation) {
            notifyRepositoriesChanged();
            return;
        }
        repositories.selectContextForResource(vscode.window.activeTextEditor?.document.uri.fsPath);
        if (!repositories.currentContext && repositories.soleTopLevelContext) {
            repositories.selectContext(repositories.soleTopLevelContext.id);
        }
        notifyRepositoriesChanged();
    }

    async function syncDiscoveredRepositories(): Promise<void> {
        const generation = ++repositoryStateGeneration;
        repositoriesResource = { status: 'loading' };
        notifyRepositoriesChanged();
        const discoveredContexts = await discoverRepositoryContexts({
            workspaceFolders: vscode.workspace.workspaceFolders,
            resolveRepositoryScanMaxDepth: (workspaceFolder) => getRepositoryScanMaxDepth(workspaceFolder.uri),
        });
        if (generation !== repositoryStateGeneration) { return; }
        const contexts = await mergeDynamicRepositoryContexts(discoveredContexts);
        if (generation !== repositoryStateGeneration) { return; }
        repositories.setContexts(contexts);
        if (navigatedRepositoryContextId && !contexts.some((repoContext) => repoContext.id === navigatedRepositoryContextId)) {
            navigatedRepositoryContextId = undefined;
            hasExplicitRepositoryNavigation = false;
        }
        gitWatcher.setContexts(contexts);
        repositoryDiscoveryWatcher.setContexts(contexts);
        const nextRepositoriesResource = await loadRepositorySummaries(contexts);
        if (generation !== repositoryStateGeneration) { return; }
        repositoriesResource = nextRepositoriesResource;
        notifyRepositoriesChanged();
        void syncVisibleRepositoryChildren();
    }

    async function loadRepositorySummaries(contexts: readonly RepoContext[], signal?: AbortSignal): Promise<Resource<readonly RepositorySummary[]>> {
        try {
            return { status: 'ready', data: await repositorySummaryService.summarize(contexts, signal) };
        } catch (error) {
            if (isAbortError(error)) { throw error; }
            return {
                status: 'error',
                error: createErrorPayload(error, {
                    code: 'gitOperationFailed',
                    operation: 'repositorySummary',
                    recoverable: true,
                }).error,
            };
        }
    }

    function syncChildRepositories(repoContext: RepoContext, signal?: AbortSignal): Promise<void> {
        const existing = childDiscoveryInFlight.get(repoContext.id);
        if (existing) {
            return waitForPromise(existing, signal).catch((error: unknown) => {
                if (signal?.aborted || !isAbortError(error)) { throw error; }
                if (childDiscoveryInFlight.get(repoContext.id) === existing) {
                    childDiscoveryInFlight.delete(repoContext.id);
                }
                return syncChildRepositories(repoContext, signal);
            });
        }

        const discovery = (async () => {
            const childContexts = await discoverChildRepositoryContexts(
                repoContext,
                getRepositoryScanMaxDepth(vscode.Uri.file(repoContext.cwd)),
                signal,
            );
            signal?.throwIfAborted();
            if (!repositories.contexts.some((contextItem) => contextItem.id === repoContext.id)) { return; }
            const knownContextIds = new Set(repositories.contexts.map((contextItem) => contextItem.id));
            const missingContexts = childContexts.filter((contextItem) => !knownContextIds.has(contextItem.id));
            if (missingContexts.length === 0) { return; }

            const generation = ++repositoryStateGeneration;
            const contexts = [...repositories.contexts, ...missingContexts];
            const nextRepositoriesResource = await loadRepositorySummaries(contexts, signal);
            signal?.throwIfAborted();
            if (generation !== repositoryStateGeneration) { return; }
            for (const childContext of childContexts) {
                dynamicRepositoryContexts.set(childContext.id, childContext);
            }
            repositories.setContexts(contexts);
            gitWatcher.setContexts(contexts);
            repositoryDiscoveryWatcher.setContexts(contexts);
            repositoriesResource = nextRepositoriesResource;
            notifyRepositoriesChanged();
            void syncVisibleRepositoryChildren();
        })();
        childDiscoveryInFlight.set(repoContext.id, discovery);
        void discovery.finally(() => {
            if (childDiscoveryInFlight.get(repoContext.id) === discovery) {
                childDiscoveryInFlight.delete(repoContext.id);
            }
        }).catch(() => {});
        return discovery;
    }

    function syncVisibleRepositoryChildren(): void {
        if (repositoriesResource.status !== 'ready') { return; }
        const summaries = repositoriesResource.data;
        const visibleParentId = activeNavigatorContextId();
        const visibleRepositoryIds = summaries
            .filter((summary) => visibleParentId
                ? summary.context.parentId === visibleParentId
                : !summary.context.parentId)
            .map((summary) => summary.context.id);
        for (const contextId of visibleRepositoryIds) {
            const contextItem = repositories.contexts.find((repoContext) => repoContext.id === contextId);
            if (contextItem) { void syncChildRepositories(contextItem); }
        }
    }

    async function mergeDynamicRepositoryContexts(discoveredContexts: readonly RepoContext[]): Promise<readonly RepoContext[]> {
        const contextsById = new Map(discoveredContexts.map((repoContext) => [repoContext.id, repoContext]));
        const dynamicParentIds = new Set([...dynamicRepositoryContexts.values()]
            .map((repoContext) => repoContext.parentId)
            .filter((parentId): parentId is string => Boolean(parentId)));
        const refreshedDynamicContexts = new Map<string, RepoContext>();
        let parentIdsToScan = [...dynamicParentIds].filter((parentId) => contextsById.has(parentId));

        while (parentIdsToScan.length > 0) {
            const nextParentIdsToScan: string[] = [];
            for (const parentId of parentIdsToScan) {
                const parentContext = contextsById.get(parentId);
                if (!parentContext) { continue; }
                for (const childContext of await discoverChildRepositoryContexts(
                    parentContext,
                    getRepositoryScanMaxDepth(vscode.Uri.file(parentContext.cwd)),
                )) {
                    refreshedDynamicContexts.set(childContext.id, childContext);
                    const wasKnownDynamicParent = dynamicParentIds.has(childContext.id);
                    if (!contextsById.has(childContext.id)) {
                        contextsById.set(childContext.id, childContext);
                    }
                    if (wasKnownDynamicParent) {
                        nextParentIdsToScan.push(childContext.id);
                    }
                }
            }
            parentIdsToScan = nextParentIdsToScan;
        }

        dynamicRepositoryContexts = refreshedDynamicContexts;
        return [...contextsById.values()];
    }

    const repositoryNavigationCoordinator = new RepositoryNavigationCoordinator({
        navigationStarted: (repoContext) => {
            activeRuntimeContextId = undefined;
            changesProvider.notifyRepoNavigationStarted(repoContext);
            commitHistoryProvider.notifyRepoNavigationStarted(repoContext);
            graphProvider.notifyRepoNavigationStarted(repoContext);
        },
        prepare: async (repoContext, signal) => {
            await vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', true);
            await syncChildRepositories(repoContext, signal);
            signal.throwIfAborted();
            await registerRuntimeContextWithRecovery({
                repositories,
                runtimeRegistrar,
                runtimeRepositories,
                repoContext,
                syncActiveRepository: syncActiveRepo,
                signal,
            });
        },
        ready: async (repoContext) => {
            if (repositories.currentContext?.id !== repoContext.id) { return; }
            activeRuntimeContextId = repoContext.id;
            notifyRepositoriesChanged();
            await Promise.all([
                changesProvider.notifyRepoChanged(repoContext),
                commitHistoryProvider.notifyRepoChanged(repoContext),
                graphProvider.notifyRepoChanged(repoContext),
            ]);
        },
        unavailable: async (signal) => {
            await vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', false);
            signal.throwIfAborted();
            activeRuntimeContextId = undefined;
            runtimeRepositories.clear();
            notifyRepositoriesChanged();
            await Promise.all([
                changesProvider.notifyRepoChanged(undefined),
                commitHistoryProvider.notifyRepoChanged(undefined),
                graphProvider.notifyRepoChanged(undefined),
            ]);
        },
        failed: (_repoContext, error) => {
            appendErrorToOutput({
                code: 'gitOperationFailed',
                message: error instanceof Error ? error.message : String(error),
                operation: 'runtimeRepositoryRegistration',
                recoverable: true,
            }, 'runtimeRepositoryRegistration');
            changesProvider.notifyRepoNavigationFailed(error);
            commitHistoryProvider.notifyRepoNavigationFailed(error);
            graphProvider.notifyRepoNavigationFailed(error);
        },
    });

    context.subscriptions.push(
        repositories,
        repositoryNavigationCoordinator,
        registerReadonlyDiffDocumentProvider(),
        registerGitBlobDocumentProvider(),
        gitWatcher,
        repositoryDiscoveryWatcher,
        registerRepositoryScanMaxDepthListener(debouncedSyncDiscoveredRepositories),
        ...changesProvider.registerNativeContextCommands(),
        ...commitHistoryProvider.registerNativeContextCommands(),
        ...graphProvider.registerNativeContextCommands(),
        registerGitBlameAnnotationsCommand({ repositories }),
        vscode.window.registerWebviewViewProvider(ChangesViewProvider.viewType, changesProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(CommitHistoryViewProvider.viewType, commitHistoryProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(GraphViewProvider.viewType, graphProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        registerWebviewFontSizeSync([changesProvider, commitHistoryProvider, graphProvider]),
        registerResetExtensionStateCommand({
            context,
            repositories,
            runtimeRepositories,
            syncActiveRepository: syncActiveRepo,
            refreshAll,
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void syncDiscoveredRepositories().then(syncActiveRepo);
        }),
        vscode.window.onDidChangeActiveTextEditor(() => {
            syncActiveRepo();
        }),
    );

    await syncDiscoveredRepositories();
    syncActiveRepo();
    await repositoryNavigationCoordinator.activate(repositories.currentContext);
    context.subscriptions.push(
        repositories.onDidChange(({ context: repoContext }) => {
            void repositoryNavigationCoordinator.activate(repoContext);
        }),
    );
}

export function deactivate(): void {}

function waitForPromise(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) { return promise; }
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
        const abort = () => { reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        void promise.then(resolve, reject).finally(() => {
            signal.removeEventListener('abort', abort);
        });
    });
}
