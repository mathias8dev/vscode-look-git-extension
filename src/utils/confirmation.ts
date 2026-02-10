import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from '../gitService';

export async function confirmDangerousOperation(
    operationName: string,
    commit: GitCommitInfo
): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('lookGit');
    if (!config.get('confirmDangerousOperations', true)) {
        return true;
    }

    const result = await vscode.window.showWarningMessage(
        `Are you sure you want to ${operationName} commit ${commit.shortHash} "${commit.message}"? This operation rewrites history.`,
        { modal: true },
        'Yes',
        'No'
    );

    return result === 'Yes';
}

export async function selectCommitFromQuickPick(
    gitService: GitService,
    placeholder: string
): Promise<GitCommitInfo | undefined> {
    const commits = await gitService.getLog(100, 0);

    const items = commits.map((c) => ({
        label: `$(git-commit) ${c.shortHash}`,
        description: c.message,
        detail: `${c.authorName} - ${c.authorDate.toLocaleDateString()}`,
        commit: c,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: placeholder,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    return selected?.commit;
}
