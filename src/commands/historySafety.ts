import * as vscode from 'vscode';
import type { GitCommitInfo, GitService } from '../gitService';

export async function ensureCommitsOnCurrentBranch(
    gitService: GitService,
    commits: GitCommitInfo[],
    operationName: string,
): Promise<boolean> {
    const currentBranch = await gitService.getCurrentBranch().catch(() => 'HEAD');
    if (!currentBranch || currentBranch === 'HEAD') {
        await vscode.window.showWarningMessage(
            `${operationName} requires a checked-out branch. The repository is currently in detached HEAD.`,
        );
        return false;
    }

    const missing: GitCommitInfo[] = [];
    for (const commit of commits) {
        if (!(await gitService.isAncestorOfHead(commit.hash))) {
            missing.push(commit);
        }
    }

    if (missing.length > 0) {
        const labels = missing.map((commit) => commit.shortHash).join(', ');
        await vscode.window.showWarningMessage(
            `${operationName} is only available for commits reachable from the current HEAD. Not on current branch: ${labels}.`,
        );
        return false;
    }

    return true;
}

export async function ensureSingleCurrentBranchCommit(
    gitService: GitService,
    commit: GitCommitInfo,
    operationName: string,
): Promise<boolean> {
    return ensureCommitsOnCurrentBranch(gitService, [commit], operationName);
}

export async function ensureNoMergeCommits(
    commits: GitCommitInfo[],
    operationName: string,
): Promise<boolean> {
    const mergeCommits = commits.filter((commit) => commit.parentHashes.length > 1);
    if (mergeCommits.length === 0) {
        return true;
    }

    const labels = mergeCommits.map((commit) => commit.shortHash).join(', ');
    await vscode.window.showWarningMessage(
        `${operationName} does not support merge commits here: ${labels}.`,
    );
    return false;
}

export async function refreshAfterMutation(
    historyProvider: { refresh(): void },
    refreshRepositoryViews?: () => Promise<void> | void,
): Promise<void> {
    if (refreshRepositoryViews) {
        await refreshRepositoryViews();
        return;
    }
    historyProvider.refresh();
}
