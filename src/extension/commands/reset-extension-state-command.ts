import * as vscode from 'vscode';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { RepositorySelectionStore } from '@extension/repositories/repository-selection-store';
import { resetLookGitStorage } from '@extension/storage/look-git-storage';

const RESET_COMMAND = 'Reset';

export function registerResetExtensionStateCommand(input: {
    readonly context: vscode.ExtensionContext;
    readonly repositories: RepositorySelectionStore;
    readonly runtimeRepositories: RepositoryRegistry;
    readonly syncActiveRepository: () => void;
    readonly refreshAll: () => Promise<void>;
}): vscode.Disposable {
    return vscode.commands.registerCommand('lookGit.resetExtensionState', async () => {
        const choice = await vscode.window.showWarningMessage(
            'Reset Look Git extension state for this VS Code profile and workspace?',
            { modal: true },
            RESET_COMMAND,
        );
        if (choice !== RESET_COMMAND) { return; }

        await resetLookGitStorage(input.context);
        input.runtimeRepositories.clear();
        input.repositories.selectContext(undefined);
        input.syncActiveRepository();
        await input.refreshAll();
        await vscode.window.showInformationMessage('Look Git extension state has been reset.');
    });
}
