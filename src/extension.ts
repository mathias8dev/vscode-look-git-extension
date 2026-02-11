import * as vscode from 'vscode';
import { GitService } from './gitService';
import { CommitHistoryProvider } from './commitHistoryProvider';
import { getBuiltInGitApi } from './utils/gitExtension';
import { registerCommands } from './commands';
import { GraphViewProvider } from './graphView/graphPanel';
import { ChangesViewProvider } from './changesView/changesProvider';

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
        vscode.window.showErrorMessage('Look Git: Built-in Git extension is not available.');
        return;
    }

    const repository = gitApi.repositories[0];

    const gitService = new GitService(repository?.rootUri.fsPath ?? '');
    const commitHistoryProvider = new CommitHistoryProvider(gitService);

    const treeView = vscode.window.createTreeView('lookGit.commitHistory', {
        treeDataProvider: commitHistoryProvider,
        showCollapseAll: false,
        canSelectMany: true,
    });

    const graphViewProvider = new GraphViewProvider(context.extensionUri, gitService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            GraphViewProvider.viewType,
            graphViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    const changesViewProvider = new ChangesViewProvider(context.extensionUri, gitService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChangesViewProvider.viewType,
            changesViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } },
        )
    );

    vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', !!repository);

    registerCommands(context, gitService, commitHistoryProvider, graphViewProvider, changesViewProvider);

    // Debounced refresh for all views when git state changes
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedRefreshAll = () => {
        if (refreshTimer) { clearTimeout(refreshTimer); }
        refreshTimer = setTimeout(() => {
            commitHistoryProvider.refresh();
            graphViewProvider.refresh();
            changesViewProvider.refresh();
        }, 150);
    };

    const watchRepository = (repo: { state: { onDidChange: (cb: () => void) => void } }) => {
        repo.state.onDidChange(debouncedRefreshAll);
    };

    if (repository) {
        watchRepository(repository);
    }

    gitApi.onDidOpenRepository((repo) => {
        gitService.setWorkingDirectory(repo.rootUri.fsPath);
        watchRepository(repo);
        debouncedRefreshAll();
        vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', true);
    });

    gitApi.onDidCloseRepository(() => {
        if (gitApi.repositories.length === 0) {
            vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', false);
        }
    });

    // Also watch for file saves to catch changes the git extension may lag on
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidChange(debouncedRefreshAll);
    fileWatcher.onDidCreate(debouncedRefreshAll);
    fileWatcher.onDidDelete(debouncedRefreshAll);
    context.subscriptions.push(fileWatcher);

    context.subscriptions.push(treeView);
}

export function deactivate(): void {}
