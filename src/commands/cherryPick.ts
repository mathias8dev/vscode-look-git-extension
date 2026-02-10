import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleCherryPick(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to cherry-pick');

    if (!commit) {
        return;
    }

    try {
        await gitService.cherryPick(commit.hash);
        vscode.window.showInformationMessage(
            `Cherry-picked commit ${commit.shortHash}: "${commit.message}"`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Cherry-pick of ${commit.shortHash} resulted in conflicts. Resolve them and commit, or abort.`,
                'Open Source Control',
                'Abort Cherry-pick'
            );

            if (action === 'Abort Cherry-pick') {
                await gitService.exec(['cherry-pick', '--abort']);
                vscode.window.showInformationMessage('Cherry-pick aborted.');
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Cherry-pick failed: ${message}`);
        }
    }
}
