import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation, selectCommitFromQuickPick } from '../utils/confirmation';
import { ensureNoMergeCommits, ensureSingleCurrentBranchCommit, refreshAfterMutation } from './historySafety';

type RepositoryRefreshCallback = () => Promise<void> | void;

export async function handleFixup(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to fixup (fold into the one below it)');

    if (!commit) {
        return;
    }

    if (!(await ensureNoMergeCommits([commit], 'Fixup commit'))) {
        return;
    }
    if (!(await ensureSingleCurrentBranchCommit(gitService, commit, 'Fixup commit'))) {
        return;
    }

    if (commit.parentHashes.length !== 1) {
        await vscode.window.showWarningMessage(
            'Cannot fixup: no parent commit found to fold into.'
        );
        return;
    }

    const parentCommit = await gitService.getCommit(commit.parentHashes[0]);
    if (!parentCommit) {
        await vscode.window.showWarningMessage('Cannot fixup: parent commit was not found.');
        return;
    }

    const confirmed = await confirmDangerousOperation('fixup', commit);
    if (!confirmed) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        await vscode.window.showWarningMessage(
            'You have uncommitted changes. Please commit or stash them before fixup.'
        );
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Fixing up ${commit.shortHash} into ${parentCommit.shortHash}...`,
                cancellable: false,
            },
            async () => {
                await gitService.fixupCommit(commit.hash, parentCommit.hash);
            }
        );

        await vscode.window.showInformationMessage(
            `Fixed up ${commit.shortHash} into ${parentCommit.shortHash}.`
        );
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Fixup caused conflicts. The rebase is paused.`,
                'Open Source Control',
                'Abort Rebase'
            );

            if (action === 'Abort Rebase') {
                await gitService.rebaseAbort();
                await vscode.window.showInformationMessage('Fixup aborted, history restored.');
                await refreshAfterMutation(historyProvider, refreshRepositoryViews);
            } else if (action === 'Open Source Control') {
                await vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            await vscode.window.showErrorMessage(`Fixup failed: ${message}`);
        }
    }
}
