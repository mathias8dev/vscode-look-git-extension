import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation, selectCommitFromQuickPick } from '../utils/confirmation';
import { refreshAfterMutation } from './historySafety';

type RepositoryRefreshCallback = () => Promise<void> | void;

export async function handleRebase(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to rebase onto');

    if (!commit) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        await vscode.window.showWarningMessage(
            'You have uncommitted changes. Please commit or stash them before rebasing.'
        );
        return;
    }

    const confirmed = await confirmDangerousOperation('rebase onto', commit);
    if (!confirmed) {
        return;
    }

    try {
        await gitService.rebase(commit.hash);
        await vscode.window.showInformationMessage(
            `Rebased onto ${commit.shortHash} successfully.`
        );
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Rebase onto ${commit.shortHash} resulted in conflicts.`,
                'Open Source Control',
                'Abort Rebase'
            );

            if (action === 'Abort Rebase') {
                await gitService.rebaseAbort();
                await vscode.window.showInformationMessage('Rebase aborted.');
                await refreshAfterMutation(historyProvider, refreshRepositoryViews);
            } else if (action === 'Open Source Control') {
                await vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            await vscode.window.showErrorMessage(`Rebase failed: ${message}`);
        }
    }
}
