import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from '../gitService';

function isModalDialogUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('DialogService') && message.includes('refused to show dialog in tests');
}

export async function showModalWarningMessage<T extends string>(
    message: string,
    ...items: T[]
): Promise<T | undefined> {
    try {
        return await vscode.window.showWarningMessage(message, { modal: true }, ...items);
    } catch (error) {
        if (!isModalDialogUnavailable(error)) {
            throw error;
        }
        return vscode.window.showWarningMessage(message, ...items);
    }
}

export async function showModalInformationMessage<T extends string>(
    message: string,
    ...items: T[]
): Promise<T | undefined> {
    try {
        return await vscode.window.showInformationMessage(message, { modal: true }, ...items);
    } catch (error) {
        if (!isModalDialogUnavailable(error)) {
            throw error;
        }
        return vscode.window.showInformationMessage(message, ...items);
    }
}

export async function confirmDangerousOperation(
    operationName: string,
    commit: GitCommitInfo
): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('lookGit');
    if (!config.get('confirmDangerousOperations', true)) {
        return true;
    }

    const result = await showModalWarningMessage(
        `Are you sure you want to ${operationName} commit ${commit.shortHash} "${commit.message}"? This operation rewrites history.`,
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
