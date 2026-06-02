import * as vscode from 'vscode';
import type { Repository } from '../types/git';
import { ActiveRepositoryRegistry } from './repositories/ActiveRepositoryRegistry';
import { ChangesViewProvider } from './views/ChangesViewProvider';
import { CommitHistoryViewProvider } from './views/CommitHistoryViewProvider';
import { GraphViewProvider } from './views/GraphViewProvider';
import { getBuiltInGitApi } from './utils/gitExtension';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const gitApi = await getBuiltInGitApi();
    if (!gitApi) { return; }

    // Track per-repo disposables
    const repoDisposables = new Map<string, vscode.Disposable[]>();

    const getActiveVsRepo = (): Repository | undefined =>
        gitApi.repositories.find((r) => r.ui.selected) ?? gitApi.repositories[0];

    const repositories = new ActiveRepositoryRegistry();
    const changesProvider = new ChangesViewProvider(context.extensionUri, repositories);
    const commitHistoryProvider = new CommitHistoryViewProvider(context.extensionUri, repositories);
    const graphProvider = new GraphViewProvider(context.extensionUri, repositories);

    context.subscriptions.push(
        repositories,
        vscode.workspace.registerTextDocumentContentProvider('lookgit-empty', {
            provideTextDocumentContent: () => '',
        }),
        ...changesProvider.registerNativeContextCommands(),
        ...commitHistoryProvider.registerNativeContextCommands(),
        ...graphProvider.registerNativeContextCommands(),
        vscode.window.registerWebviewViewProvider(ChangesViewProvider.viewType, changesProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(CommitHistoryViewProvider.viewType, commitHistoryProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(GraphViewProvider.viewType, graphProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        repositories.onDidChange(({ context: repoContext }) => {
            void vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', Boolean(repoContext));
            if (repoContext) {
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
        '**/.git/CHERRY_PICK_HEAD', '**/.git/FETCH_HEAD',
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
