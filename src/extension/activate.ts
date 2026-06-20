import * as vscode from 'vscode';
import type { Repository } from '../types/git';
import { ActiveRepositoryRegistry } from './repositories/ActiveRepositoryRegistry';
import { ChangesViewProvider } from './views/ChangesViewProvider';
import { CommitHistoryViewProvider } from './views/CommitHistoryViewProvider';
import { GraphViewProvider } from './views/GraphViewProvider';
import { defaultRemoteCommandBackend } from './git/hybrid-remote-command-backend';
import { getBuiltInGitApi } from './utils/gitExtension';
import { registerReadonlyDiffDocumentProvider } from './utils/readonly-diff-documents';
import { registerGitBlobDocumentProvider } from './utils/git-blob-documents';
import { registerWebviewFontSizeSync } from './views/webview-font';
import { GitRootRepositoryResolver } from './repositories/GitRepositoryResolver';
import { RepositoryRegistry } from './repositories/RepositoryRegistry';
import { appendErrorToOutput } from './messaging/errorOutputChannel';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const gitApi = await getBuiltInGitApi();
    if (!gitApi) { return; }

    // Track per-repo disposables
    const repoDisposables = new Map<string, vscode.Disposable[]>();

    const getActiveVsRepo = (): Repository | undefined =>
        gitApi.repositories.find((r) => r.ui.selected) ?? gitApi.repositories[0];

    const repositories = new ActiveRepositoryRegistry();
    const runtimeRepositories = new RepositoryRegistry();
    const repositoryResolver = new GitRootRepositoryResolver(repositories);
    const remoteCommands = defaultRemoteCommandBackend;
    const graphRepositoryRefreshers: Array<() => Promise<void>> = [];
    const graphProvider = new GraphViewProvider(context.extensionUri, repositories, async () => {
        await Promise.all(graphRepositoryRefreshers.map((refresh) => refresh()));
    }, remoteCommands, context.globalStorageUri);
    const refreshGraph = () => graphProvider.refresh();
    const changesProvider = new ChangesViewProvider(context.extensionUri, repositories, refreshGraph, remoteCommands);
    const commitHistoryProvider = new CommitHistoryViewProvider(context.extensionUri, repositories, refreshGraph, remoteCommands, repositoryResolver, context.globalStorageUri);
    graphRepositoryRefreshers.push(() => changesProvider.refresh(), () => commitHistoryProvider.refresh());

    context.subscriptions.push(
        repositories,
        registerReadonlyDiffDocumentProvider(),
        registerGitBlobDocumentProvider(),
        ...changesProvider.registerNativeContextCommands(),
        ...commitHistoryProvider.registerNativeContextCommands(),
        ...graphProvider.registerNativeContextCommands(),
        vscode.window.registerWebviewViewProvider(ChangesViewProvider.viewType, changesProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(CommitHistoryViewProvider.viewType, commitHistoryProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(GraphViewProvider.viewType, graphProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        registerWebviewFontSizeSync([changesProvider, commitHistoryProvider, graphProvider]),
        repositories.onDidChange(({ context: repoContext }) => {
            void vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', Boolean(repoContext));
            if (repoContext) {
                void repositories.registerCurrentRuntimeContext(runtimeRepositories).catch((error) => {
                    appendErrorToOutput({
                        code: 'gitOperationFailed',
                        message: error instanceof Error ? error.message : String(error),
                        operation: 'runtimeRepositoryRegistration',
                        recoverable: true,
                    }, 'runtimeRepositoryRegistration');
                });
                void changesProvider.notifyRepoChanged(repoContext);
                void commitHistoryProvider.notifyRepoChanged(repoContext);
                void graphProvider.notifyRepoChanged(repoContext);
            } else {
                void changesProvider.refresh();
                void commitHistoryProvider.refresh();
                void graphProvider.refresh();
            }
        }),
    );

    // Update active repo and notify providers
    const DEBOUNCE_MS = 150;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function debouncedRefreshAll(): void {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            void changesProvider.refresh();
            void commitHistoryProvider.refresh();
            void graphProvider.refresh();
        }, DEBOUNCE_MS);
    }

    function syncActiveRepo(): void {
        const vsRepo = getActiveVsRepo();
        repositories.setActiveRepository(vsRepo?.rootUri.fsPath);
    }

    // Wire per-repo state watchers
    function watchRepo(repo: Repository): void {
        const key = repo.rootUri.fsPath;
            const disposables: vscode.Disposable[] = [
                repo.state.onDidChange(() => debouncedRefreshAll()),
                repo.ui.onDidChange(() => syncActiveRepo()),
            ];
        repoDisposables.set(key, disposables);
    }

    for (const repo of gitApi.repositories) { watchRepo(repo); }

    context.subscriptions.push(
        gitApi.onDidOpenRepository((repo) => { watchRepo(repo); syncActiveRepo(); }),
        gitApi.onDidCloseRepository((repo) => {
            const key = repo.rootUri.fsPath;
            repoDisposables.get(key)?.forEach((d) => d.dispose());
            repoDisposables.delete(key);
            syncActiveRepo();
        }),
    );

    // File watchers for git metadata (including worktrees)
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

    syncActiveRepo();
}

export function deactivate(): void {}
