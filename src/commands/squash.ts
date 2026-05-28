import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation } from '../utils/confirmation';
import { promptSquashMessage } from './squashMessage';
import { ensureCommitsOnCurrentBranch, ensureNoMergeCommits, refreshAfterMutation } from './historySafety';

type RepositoryRefreshCallback = () => Promise<void> | void;

export async function handleSquash(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    selectedItems?: CommitItem[],
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    // If multi-selected from tree view, use those directly
    if (selectedItems && selectedItems.length >= 2) {
        await squashCommits(
            gitService,
            historyProvider,
            selectedItems.map((i) => i.commitInfo),
            refreshRepositoryViews,
        );
        return;
    }

    // Otherwise show QuickPick for manual selection
    const commits = await gitService.getLog(100, 0);
    if (commits.length < 2) {
        await vscode.window.showWarningMessage('Need at least 2 commits to squash.');
        return;
    }

    const quickPickItems = commits.map((c) => ({
        label: `${c.shortHash}  ${c.message}`,
        description: `${c.authorName} - ${c.authorDate.toLocaleDateString()}`,
        commit: c,
        picked: false,
    }));

    if (item) {
        const match = quickPickItems.find((i) => i.commit.hash === item.commitInfo.hash);
        if (match) {
            match.picked = true;
        }
    }

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select commits to squash (they must be consecutive)',
        canPickMany: true,
    });

    if (!selected || selected.length < 2) {
        await vscode.window.showWarningMessage('Select at least 2 commits to squash.');
        return;
    }

    await squashCommits(gitService, historyProvider, selected.map((s) => s.commit), refreshRepositoryViews);
}

async function squashCommits(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    selectedCommits: GitCommitInfo[],
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const uniqueSelectedCommits = dedupeCommits(selectedCommits);
    if (uniqueSelectedCommits.length < 2) {
        await vscode.window.showWarningMessage('Select at least 2 commits to squash.');
        return;
    }

    if (!(await ensureNoMergeCommits(uniqueSelectedCommits, 'Squash commits'))) {
        return;
    }
    if (!(await ensureCommitsOnCurrentBranch(gitService, uniqueSelectedCommits, 'Squash commits'))) {
        return;
    }

    const orderedCommits = await orderConsecutiveCommitsFromHead(gitService, uniqueSelectedCommits);
    if (!orderedCommits) {
        return;
    }
    const oldestCommit = orderedCommits[orderedCommits.length - 1];
    const commitsToSquash = orderedCommits.slice(0, -1);

    const confirmed = await confirmDangerousOperation('squash into', oldestCommit);
    if (!confirmed) {
        return;
    }

    const squashMessage = await promptSquashMessage(oldestCommit.message);
    if (!squashMessage) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        await vscode.window.showWarningMessage(
            'You have uncommitted changes. Please commit or stash them before squashing.'
        );
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Squashing ${uniqueSelectedCommits.length} commits...`,
                cancellable: false,
            },
            async () => {
                await gitService.squashCommits(
                    oldestCommit.hash,
                    commitsToSquash.map((c) => c.hash),
                    squashMessage
                );
            }
        );

        await vscode.window.showInformationMessage(
            `Squashed ${uniqueSelectedCommits.length} commits into ${oldestCommit.shortHash}.`
        );
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
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
                await vscode.window.showInformationMessage('Squash aborted, history restored.');
                await refreshAfterMutation(historyProvider, refreshRepositoryViews);
            } else if (action === 'Open Source Control') {
                await vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            await vscode.window.showErrorMessage(`Squash failed: ${message}`);
        }
    }
}

function dedupeCommits(commits: GitCommitInfo[]): GitCommitInfo[] {
    const seen = new Set<string>();
    const result: GitCommitInfo[] = [];
    for (const commit of commits) {
        if (seen.has(commit.hash)) {
            continue;
        }
        seen.add(commit.hash);
        result.push(commit);
    }
    return result;
}

async function orderConsecutiveCommitsFromHead(
    gitService: GitService,
    selectedCommits: GitCommitInfo[],
): Promise<GitCommitInfo[] | undefined> {
    const headHashes = await gitService.getHeadCommitHashes();
    const entries = selectedCommits.map((commit) => ({
        commit,
        index: headHashes.findIndex((hash) => hashesMatch(hash, commit.hash)),
    }));
    const missing = entries.filter((entry) => entry.index === -1);
    if (missing.length > 0) {
        await vscode.window.showWarningMessage(
            `Selected commits must be reachable from the current HEAD: ${missing.map((entry) => entry.commit.shortHash).join(', ')}.`,
        );
        return undefined;
    }

    const ordered = [...entries].sort((a, b) => a.index - b.index);
    for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].index - ordered[i - 1].index !== 1) {
            await vscode.window.showWarningMessage(
                'Selected commits must be consecutive in the current branch history.'
            );
            return undefined;
        }
    }

    return ordered.map((entry) => entry.commit);
}

function hashesMatch(fullHash: string, maybeShortHash: string): boolean {
    return fullHash === maybeShortHash
        || fullHash.startsWith(maybeShortHash)
        || maybeShortHash.startsWith(fullHash);
}
