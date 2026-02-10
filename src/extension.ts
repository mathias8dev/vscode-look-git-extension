import * as vscode from 'vscode';
import { GitService } from './gitService';
import { CommitHistoryProvider } from './commitHistoryProvider';
import { getBuiltInGitApi } from './utils/gitExtension';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
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
    });

    vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', !!repository);

    registerCommands(context, gitService, commitHistoryProvider);

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
        });
    }

    context.subscriptions.push(treeView);
}

export function deactivate(): void {}
