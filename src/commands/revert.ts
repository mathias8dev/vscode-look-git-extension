import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleRevert(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    selectedItems?: CommitItem[]
): Promise<void> {
    // Multi-select: revert all selected commits (newest first to avoid conflicts)
    const items = selectedItems && selectedItems.length > 1 ? selectedItems : undefined;

    if (items) {
        const commits = items.map((i) => i.commitInfo);
        const hashList = commits.map((c) => c.shortHash).join(', ');

        const confirmed = await vscode.window.showInformationMessage(
            `Revert ${commits.length} commits (${hashList})?`,
            { modal: true },
            'Revert'
        );
        if (confirmed !== 'Revert') {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Reverting ${commits.length} commits...`,
                    cancellable: false,
                },
                async () => {
                    for (const commit of commits) {
                        await gitService.revert(commit.hash);
                    }
                }
            );

            vscode.window.showInformationMessage(
                `Reverted ${commits.length} commits successfully.`
            );
            historyProvider.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('CONFLICT') || message.includes('conflict')) {
                const action = await vscode.window.showErrorMessage(
                    'Revert resulted in conflicts.',
                    'Open Source Control',
                    'Abort Revert'
                );
                if (action === 'Abort Revert') {
                    try { await gitService.exec(['revert', '--abort']); } catch { /* already aborted */ }
                    vscode.window.showInformationMessage('Revert aborted.');
                } else if (action === 'Open Source Control') {
                    vscode.commands.executeCommand('workbench.view.scm');
                }
            } else {
                vscode.window.showErrorMessage(`Revert failed: ${message}`);
            }
        }
        return;
    }

    // Single select
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
                try { await gitService.exec(['revert', '--abort']); } catch { /* already aborted */ }
                vscode.window.showInformationMessage('Revert aborted.');
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Revert failed: ${message}`);
        }
    }
}
