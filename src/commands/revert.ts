import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleRevert(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to revert');

    if (!commit) {
        return;
    }

    try {
        await gitService.revert(commit.hash);
        vscode.window.showInformationMessage(
            `Reverted commit ${commit.shortHash}: "${commit.message}"`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Revert of ${commit.shortHash} resulted in conflicts.`,
                'Open Source Control',
                'Abort Revert'
            );

            if (action === 'Abort Revert') {
                try {
                    await gitService.exec(['revert', '--abort']);
                } catch {
                    // Already aborted or no revert in progress
                }
                vscode.window.showInformationMessage('Revert aborted.');
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Revert failed: ${message}`);
        }
    }
}
