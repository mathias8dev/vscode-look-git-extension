import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleRenameCommit(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to rename');

    if (!commit) {
        return;
    }

    const currentMessage = await gitService.getCommitMessage(commit.hash);

    const newMessage = await vscode.window.showInputBox({
        prompt: `Edit commit message for ${commit.shortHash}`,
        value: currentMessage.trim(),
        placeHolder: 'Enter new commit message',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Commit message cannot be empty';
            }
            return null;
        },
    });

    if (!newMessage || newMessage.trim() === currentMessage.trim()) {
        return;
    }

    const log = await gitService.getLog(1, 0);
    const isHead = log.length > 0 && log[0].hash === commit.hash;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Renaming commit ${commit.shortHash}...`,
                cancellable: false,
            },
            async () => {
                if (isHead) {
                    await gitService.amendMessage(newMessage.trim());
                } else {
                    const hasChanges = await gitService.hasUncommittedChanges();
                    if (hasChanges) {
                        throw new Error(
                            'You have uncommitted changes. Please commit or stash them first.'
                        );
                    }
                    await gitService.renameCommit(commit.hash, newMessage.trim());
                }
            }
        );

        vscode.window.showInformationMessage(
            `Commit ${commit.shortHash} message updated.`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Rename failed: ${message}`);
    }
}
