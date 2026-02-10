import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation, selectCommitFromQuickPick } from '../utils/confirmation';

async function checkRebaseState(gitService: GitService): Promise<boolean> {
    const inProgress = await gitService.isRebaseInProgress();
    if (inProgress) {
        const action = await vscode.window.showWarningMessage(
            'A rebase is already in progress. Abort it first?',
            { modal: true },
            'Abort Rebase',
            'Cancel'
        );
        if (action === 'Abort Rebase') {
            await gitService.rebaseAbort();
            return true; // Rebase aborted, can proceed
        }
        return false; // User cancelled
    }
    return true; // No rebase in progress
}

export async function handleDrop(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    selectedItems?: CommitItem[]
): Promise<void> {
    // Multi-select: drop all selected commits in a single rebase
    const items = selectedItems && selectedItems.length > 1 ? selectedItems : undefined;

    if (items) {
        const commits = items.map((i) => i.commitInfo);
        const hashList = commits.map((c) => c.shortHash).join(', ');

        const confirmed = await vscode.window.showWarningMessage(
            `Drop ${commits.length} commits (${hashList})? This rewrites history.`,
            { modal: true },
            'Drop',
            'Cancel'
        );
        if (confirmed !== 'Drop') {
            return;
        }

        const hasChanges = await gitService.hasUncommittedChanges();
        if (hasChanges) {
            vscode.window.showWarningMessage(
                'You have uncommitted changes. Please commit or stash them before dropping commits.'
            );
            return;
        }

        const canProceed = await checkRebaseState(gitService);
        if (!canProceed) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Dropping ${commits.length} commits...`,
                    cancellable: false,
                },
                async () => {
                    await gitService.dropCommits(commits.map((c) => c.hash));
                }
            );

            vscode.window.showInformationMessage(
                `Dropped ${commits.length} commits.`
            );
            historyProvider.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('CONFLICT') || message.includes('conflict')) {
                const action = await vscode.window.showErrorMessage(
                    'Dropping commits caused conflicts. The rebase is paused.',
                    'Open Source Control',
                    'Abort Rebase'
                );
                if (action === 'Abort Rebase') {
                    await gitService.rebaseAbort();
                    vscode.window.showInformationMessage('Drop aborted, history restored.');
                    historyProvider.refresh();
                } else if (action === 'Open Source Control') {
                    vscode.commands.executeCommand('workbench.view.scm');
                }
            } else {
                vscode.window.showErrorMessage(`Drop failed: ${message}`);
            }
        }
        return;
    }

    // Single select
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to drop');

    if (!commit) {
        return;
    }

    const confirmed = await confirmDangerousOperation('drop', commit);
    if (!confirmed) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        vscode.window.showWarningMessage(
            'You have uncommitted changes. Please commit or stash them before dropping a commit.'
        );
        return;
    }

    const canProceed = await checkRebaseState(gitService);
    if (!canProceed) {
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Dropping commit ${commit.shortHash}...`,
                cancellable: false,
            },
            async () => {
                await gitService.dropCommit(commit.hash);
            }
        );

        vscode.window.showInformationMessage(
            `Dropped commit ${commit.shortHash}: "${commit.message}"`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Dropping ${commit.shortHash} caused conflicts. The rebase is paused.`,
                'Open Source Control',
                'Abort Rebase'
            );

            if (action === 'Abort Rebase') {
                await gitService.rebaseAbort();
                vscode.window.showInformationMessage('Drop aborted, history restored.');
                historyProvider.refresh();
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Drop failed: ${message}`);
        }
    }
}
