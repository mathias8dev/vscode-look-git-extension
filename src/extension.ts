import * as vscode from 'vscode';
import { GitService } from './gitService';
import { CommitHistoryProvider } from './commitHistoryProvider';
import { getBuiltInGitApi } from './utils/gitExtension';
import { registerCommands } from './commands';
import { GraphViewProvider } from './graphView/graphPanel';
import { ChangesViewProvider } from './changesView/changesProvider';
import type { Repository } from './types/git';

// Content provider that always returns empty content — used as the
// "empty" side when diffing added or deleted files.
class EmptyContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(): string {
        return '';
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Register the empty content provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            'lookgit-empty',
            new EmptyContentProvider()
        )
    );

    const gitApi = await getBuiltInGitApi();
    if (!gitApi) {
        await vscode.window.showErrorMessage('Look Git: Built-in Git extension is not available.');
        return;
    }

    const getActiveRepository = (): Repository | undefined =>
        gitApi.repositories.find((repo) => repo.ui.selected) ?? gitApi.repositories[0];

    const repository = getActiveRepository();

    const gitService = new GitService(repository?.rootUri.fsPath ?? '');
    const commitHistoryProvider = new CommitHistoryProvider(gitService, context.extensionUri);

    const treeView = vscode.window.createTreeView('lookGit.commitHistory', {
        treeDataProvider: commitHistoryProvider,
        showCollapseAll: false,
        canSelectMany: true,
    });

    const changesViewProvider = new ChangesViewProvider(context.extensionUri, gitService);

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let graphViewProvider: GraphViewProvider;

    const refreshRepositoryViews = async (): Promise<void> => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = undefined;
        }

        commitHistoryProvider.refresh();
        await Promise.all([
            graphViewProvider.refresh(),
            changesViewProvider.refresh(),
        ]);
    };

    graphViewProvider = new GraphViewProvider(context.extensionUri, gitService, refreshRepositoryViews);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            GraphViewProvider.viewType,
            graphViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChangesViewProvider.viewType,
            changesViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    await vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', !!repository);

    registerCommands(context, gitService, commitHistoryProvider, graphViewProvider, changesViewProvider, refreshRepositoryViews);

    // Debounced refresh for all views when git state changes
    const debouncedRefreshAll = () => {
        if (refreshTimer) { clearTimeout(refreshTimer); }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void refreshRepositoryViews();
        }, 150);
    };

    const repoWatchers = new Map<string, vscode.Disposable[]>();
    const useActiveRepository = () => {
        const active = getActiveRepository();
        gitService.setWorkingDirectory(active?.rootUri.fsPath ?? '');
        void vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', !!active);
        debouncedRefreshAll();
    };

    const watchRepository = (repo: Repository) => {
        const key = repo.rootUri.toString();
        if (repoWatchers.has(key)) {
            return;
        }
        const disposables = [
            repo.state.onDidChange(debouncedRefreshAll),
            repo.ui.onDidChange(() => {
                if (repo.ui.selected) {
                    useActiveRepository();
                }
            }),
        ];
        repoWatchers.set(key, disposables);
        context.subscriptions.push(...disposables);
    };

    gitApi.repositories.forEach(watchRepository);

    context.subscriptions.push(gitApi.onDidOpenRepository((repo) => {
        watchRepository(repo);
        useActiveRepository();
    }));

    context.subscriptions.push(gitApi.onDidCloseRepository((repo) => {
        const key = repo.rootUri.toString();
        repoWatchers.get(key)?.forEach((disposable) => disposable.dispose());
        repoWatchers.delete(key);
        useActiveRepository();
    }));

    // Watch only Git metadata that changes visible repository state. Watching
    // all of .git also tracks object/log/lock churn and can refresh the views
    // many times during fetches, rebases, and large commits.
    const gitMetadataPatterns = [
        '**/.git/HEAD',
        '**/.git/index',
        '**/.git/MERGE_HEAD',
        '**/.git/REBASE_HEAD',
        '**/.git/CHERRY_PICK_HEAD',
        '**/.git/FETCH_HEAD',
        '**/.git/ORIG_HEAD',
        '**/.git/packed-refs',
        '**/.git/refs/**',
        // Linked worktree metadata lives under .git/worktrees/<name>/
        '**/.git/worktrees/*/HEAD',
        '**/.git/worktrees/*/gitdir',
        '**/.git/worktrees/*/MERGE_HEAD',
        '**/.git/worktrees/*/REBASE_HEAD',
    ];
    for (const pattern of gitMetadataPatterns) {
        const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        fileWatcher.onDidChange(debouncedRefreshAll);
        fileWatcher.onDidCreate(debouncedRefreshAll);
        fileWatcher.onDidDelete(debouncedRefreshAll);
        context.subscriptions.push(fileWatcher);
    }

    context.subscriptions.push(treeView);
}

export function deactivate(): void {}
