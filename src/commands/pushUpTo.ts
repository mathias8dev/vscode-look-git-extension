import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handlePushUpTo(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to push up to');

    if (!commit) {
        return;
    }

    // Determine remote and branch
    const tracking = await gitService.getTrackingBranch();
    let remoteName: string;
    let branchName: string;

    if (tracking) {
        remoteName = tracking.remote;
        branchName = tracking.branch;
    } else {
        // Ask user to pick remote
        const remotes = await gitService.getRemotes();
        if (remotes.length === 0) {
            vscode.window.showErrorMessage('No remotes configured.');
            return;
        }

        if (remotes.length === 1) {
            remoteName = remotes[0];
        } else {
            const picked = await vscode.window.showQuickPick(remotes, {
                placeHolder: 'Select remote to push to',
            });
            if (!picked) {
                return;
            }
            remoteName = picked;
        }

        const currentBranch = await gitService.getCurrentBranch();
        branchName = currentBranch;
    }

    const confirmed = await vscode.window.showInformationMessage(
        `Push commits up to ${commit.shortHash} to ${remoteName}/${branchName}?`,
        { modal: true },
        'Push'
    );

    if (confirmed !== 'Push') {
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Pushing up to ${commit.shortHash} to ${remoteName}/${branchName}...`,
                cancellable: false,
            },
            async () => {
                await gitService.pushUpTo(commit.hash, remoteName, branchName);
            }
        );

        vscode.window.showInformationMessage(
            `Pushed commits up to ${commit.shortHash} to ${remoteName}/${branchName}.`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Push failed: ${message}`);
    }
}
