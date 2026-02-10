import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation, selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleFixup(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to fixup (fold into the one below it)');

    if (!commit) {
        return;
    }

    // Find the parent commit (the one this will be folded into)
    const commits = await gitService.getLog(100, 0);
    const idx = commits.findIndex((c) => c.hash === commit.hash);

    if (idx === -1 || idx === commits.length - 1) {
        vscode.window.showWarningMessage(
            'Cannot fixup: no parent commit found to fold into.'
        );
        return;
    }

    const parentCommit = commits[idx + 1];

    const confirmed = await confirmDangerousOperation('fixup', commit);
    if (!confirmed) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        vscode.window.showWarningMessage(
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

        vscode.window.showInformationMessage(
            `Fixed up ${commit.shortHash} into ${parentCommit.shortHash}.`
        );
        historyProvider.refresh();
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
                vscode.window.showInformationMessage('Fixup aborted, history restored.');
                historyProvider.refresh();
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Fixup failed: ${message}`);
        }
    }
}
