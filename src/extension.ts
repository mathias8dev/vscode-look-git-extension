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

    gitApi.onDidOpenRepository((repo) => {
        gitService.setWorkingDirectory(repo.rootUri.fsPath);
        commitHistoryProvider.refresh();
        vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', true);
    });

    gitApi.onDidCloseRepository(() => {
        if (gitApi.repositories.length === 0) {
            vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', false);
        }
    });

    if (repository) {
        repository.state.onDidChange(() => {
            commitHistoryProvider.refresh();
            changesViewProvider.refresh();
        });
    }

    context.subscriptions.push(treeView);
}

export function deactivate(): void {}
