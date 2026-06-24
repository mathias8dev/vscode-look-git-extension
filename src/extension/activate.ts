import * as vscode from 'vscode';
import { registerResetExtensionStateCommand } from '@extension/commands/reset-extension-state-command';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { HybridGitRuntime } from '@extension/git/hybrid-git-runtime';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { VscodeGitRemoteRuntime } from '@extension/git/vscode-git-remote-runtime';
import { RepositoryRuntimeRegistrar } from '@extension/repositories/repository-runtime-registrar';
import { RepositorySelectionStore } from '@extension/repositories/repository-selection-store';
import { discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { RepositorySummaryService } from '@extension/repositories/repository-summary';
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
import { RepositoryWorkingTreeWatcher } from '@extension/watchers/repository-working-tree-watcher';
import { RepositoryDiscoveryWatcher } from '@extension/watchers/repository-discovery-watcher';
import type { RepoContext } from '@core/git/domain/repo-context';
import type { Resource } from '@protocol/shared/base';
import type { RepositoriesChangedPush, RepositoryNavigationMessage, RepositorySummary } from '@protocol/shared/repo';
import { createErrorPayload } from '@extension/messaging/error-serialization';

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
    const graphRepositoryRefreshers: Array<() => Promise<void>> = [];
    async function handleRepositoryNavigation(message: RepositoryNavigationMessage): Promise<void> {
        switch (message.type) {
            case 'repo/selectRepository':
                if (!repositories.contexts.some((contextItem) => contextItem.id === message.contextId)) { return; }
                navigatedRepositoryContextId = message.contextId;
                repositories.selectContext(message.contextId);
                notifyRepositoriesChanged();
                return;
            case 'repo/showRepositoryList':
                navigatedRepositoryContextId = undefined;
                notifyRepositoriesChanged();
                return;
            case 'repo/openRepositoryInNewWindow': {
                const repository = repositories.contexts.find((contextItem) => contextItem.id === message.contextId);
                if (!repository) { return; }
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repository.cwd), true);
                return;
            }
        }
    }
    const graphProvider = new GraphViewProvider(context.extensionUri, repositories, async () => {
        await Promise.all(graphRepositoryRefreshers.map((refresh) => refresh()));
    }, context.globalStorageUri, runtimeRepositories, handleRepositoryNavigation);
    const refreshGraph = () => graphProvider.refresh();
    const changesProvider = new ChangesViewProvider(context.extensionUri, repositories, refreshGraph, undefined, undefined, undefined, undefined, runtimeRepositories, undefined, undefined, handleRepositoryNavigation);
    const commitHistoryProvider = new CommitHistoryViewProvider(context.extensionUri, repositories, refreshGraph, context.globalStorageUri, undefined, runtimeRepositories, handleRepositoryNavigation);
    graphRepositoryRefreshers.push(() => changesProvider.refresh(), () => commitHistoryProvider.refresh());

    async function refreshAll(): Promise<void> {
        await Promise.all([
            changesProvider.refresh(),
            commitHistoryProvider.refresh(),
            graphProvider.refresh(),
        ]);
    }

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

    const workingTreeWatcher = new RepositoryWorkingTreeWatcher(debouncedRefreshAll);
    const repositoryDiscoveryWatcher = new RepositoryDiscoveryWatcher(debouncedSyncDiscoveredRepositories);

    function repositoriesChangedMessage(): RepositoriesChangedPush {
        return {
            type: 'repo/repositoriesChanged',
            repositories: repositoriesResource,
            activeContextId: { status: 'ready', data: activeNavigatorContextId() },
        };
    }

    function activeNavigatorContextId(): string | undefined {
        if (repositoriesResource.status === 'ready' && repositoriesResource.data.length <= 1) {
            return repositories.currentContext?.id;
        }
        return navigatedRepositoryContextId;
    }

    function notifyRepositoriesChanged(): void {
        const message = repositoriesChangedMessage();
        changesProvider.notifyRepositoriesChanged(message);
        commitHistoryProvider.notifyRepositoriesChanged(message);
        graphProvider.notifyRepositoriesChanged(message);
    }

    function syncActiveRepo(): void {
        if (navigatedRepositoryContextId) {
            notifyRepositoriesChanged();
            return;
        }
        repositories.selectContextForResource(vscode.window.activeTextEditor?.document.uri.fsPath);
        notifyRepositoriesChanged();
    }

    async function syncDiscoveredRepositories(): Promise<void> {
        repositoriesResource = { status: 'loading' };
        notifyRepositoriesChanged();
        const contexts = await discoverRepositoryContexts({
            workspaceFolders: vscode.workspace.workspaceFolders,
        });
        repositories.setContexts(contexts);
        if (navigatedRepositoryContextId && !contexts.some((repoContext) => repoContext.id === navigatedRepositoryContextId)) {
            navigatedRepositoryContextId = undefined;
        }
        workingTreeWatcher.setContexts(contexts);
        try {
            repositoriesResource = { status: 'ready', data: await repositorySummaryService.summarize(contexts) };
        } catch (error) {
            repositoriesResource = {
                status: 'error',
                error: createErrorPayload(error, {
                    code: 'gitOperationFailed',
                    operation: 'repositorySummary',
                    recoverable: true,
                }).error,
            };
        }
        notifyRepositoriesChanged();
    }

    async function handleRepositoryChanged(repoContext: RepoContext | undefined): Promise<void> {
        notifyRepositoriesChanged();
        await vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', Boolean(repoContext));
        if (!repoContext) {
            runtimeRepositories.clear();
            await refreshAll();
            return;
        }

        try {
            await registerRuntimeContextWithRecovery({
                repositories,
                runtimeRegistrar,
                runtimeRepositories,
                repoContext,
                syncActiveRepository: syncActiveRepo,
            });
        } catch (error) {
            appendErrorToOutput({
                code: 'gitOperationFailed',
                message: error instanceof Error ? error.message : String(error),
                operation: 'runtimeRepositoryRegistration',
                recoverable: true,
            }, 'runtimeRepositoryRegistration');
            return;
        }

        if (repositories.currentContext?.id !== repoContext.id) { return; }
        await Promise.all([
            changesProvider.notifyRepoChanged(repoContext),
            commitHistoryProvider.notifyRepoChanged(repoContext),
            graphProvider.notifyRepoChanged(repoContext),
        ]);
    }

    context.subscriptions.push(
        repositories,
        registerReadonlyDiffDocumentProvider(),
        registerGitBlobDocumentProvider(),
        workingTreeWatcher,
        repositoryDiscoveryWatcher,
        ...changesProvider.registerNativeContextCommands(),
        ...commitHistoryProvider.registerNativeContextCommands(),
        ...graphProvider.registerNativeContextCommands(),
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

    const gitMetadataPatterns = [
        '**/.git/HEAD', '**/.git/index',
        '**/.git/MERGE_HEAD', '**/.git/REBASE_HEAD',
        '**/.git/CHERRY_PICK_HEAD',
        '**/.git/packed-refs', '**/.git/refs/**',
        '**/.git/worktrees/*/HEAD', '**/.git/worktrees/*/gitdir',
    ];
    for (const pattern of gitMetadataPatterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        context.subscriptions.push(
            watcher,
            watcher.onDidChange(debouncedRefreshAll),
            watcher.onDidCreate(debouncedRefreshAll),
            watcher.onDidDelete(debouncedRefreshAll),
        );
    }

    await syncDiscoveredRepositories();
    syncActiveRepo();
    await handleRepositoryChanged(repositories.currentContext);
    context.subscriptions.push(
        repositories.onDidChange(({ context: repoContext }) => {
            void handleRepositoryChanged(repoContext);
        }),
    );
}

export function deactivate(): void {}
