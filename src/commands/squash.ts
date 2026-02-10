import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation } from '../utils/confirmation';

export async function handleSquash(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    // Load commits for multi-select
    const commits = await gitService.getLog(100, 0);
    if (commits.length < 2) {
        vscode.window.showWarningMessage('Need at least 2 commits to squash.');
        return;
    }

    const items = commits.map((c) => ({
        label: `${c.shortHash}  ${c.message}`,
        description: `${c.authorName} - ${c.authorDate.toLocaleDateString()}`,
        commit: c,
        picked: false,
    }));

    // If invoked from context menu, pre-select that commit
    if (item) {
        const match = items.find((i) => i.commit.hash === item.commitInfo.hash);
        if (match) {
            match.picked = true;
        }
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select commits to squash (they must be consecutive)',
        canPickMany: true,
    });

    if (!selected || selected.length < 2) {
        vscode.window.showWarningMessage('Select at least 2 commits to squash.');
        return;
    }

    // Verify commits are consecutive by checking their positions in the log
    const selectedHashes = new Set(selected.map((s) => s.commit.hash));
    const indices = commits
        .map((c, i) => selectedHashes.has(c.hash) ? i : -1)
        .filter((i) => i !== -1)
        .sort((a, b) => a - b);

    for (let i = 1; i < indices.length; i++) {
        if (indices[i] - indices[i - 1] !== 1) {
            vscode.window.showWarningMessage(
                'Selected commits must be consecutive in the history.'
            );
            return;
        }
    }

    // Sort selected commits in log order (oldest last in log = highest index)
    const orderedCommits: GitCommitInfo[] = indices.map((i) => commits[i]);
    const oldestCommit = orderedCommits[orderedCommits.length - 1];
    // Commits to squash = all except the oldest (which keeps "pick")
    const commitsToSquash = orderedCommits.slice(0, -1);

    const confirmed = await confirmDangerousOperation('squash into', oldestCommit);
    if (!confirmed) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        vscode.window.showWarningMessage(
            'You have uncommitted changes. Please commit or stash them before squashing.'
        );
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Squashing ${selected.length} commits...`,
                cancellable: false,
            },
            async () => {
                await gitService.squashCommits(
                    oldestCommit.hash,
                    commitsToSquash.map((c) => c.hash)
                );
            }
        );

        vscode.window.showInformationMessage(
            `Squashed ${selected.length} commits into ${oldestCommit.shortHash}.`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                'Squash caused conflicts. The rebase is paused.',
                'Open Source Control',
                'Abort Rebase'
            );

            if (action === 'Abort Rebase') {
                await gitService.rebaseAbort();
                vscode.window.showInformationMessage('Squash aborted, history restored.');
                historyProvider.refresh();
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Squash failed: ${message}`);
        }
    }
}
