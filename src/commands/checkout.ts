import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleCheckout(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to checkout');

    if (!commit) {
        return;
    }

    const choice = await vscode.window.showQuickPick(
        [
            {
                label: '$(git-branch) Create new branch here',
                description: 'Create a new branch at this commit and switch to it',
                action: 'branch' as const,
            },
            {
                label: '$(debug-disconnect) Detached HEAD',
                description: 'Checkout this commit directly (detached HEAD state)',
                action: 'detached' as const,
            },
        ],
        { placeHolder: `Checkout ${commit.shortHash}: "${commit.message}"` }
    );

    if (!choice) {
        return;
    }

    try {
        if (choice.action === 'branch') {
            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter new branch name',
                placeHolder: 'my-new-branch',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Branch name cannot be empty';
                    }
                    if (/\s/.test(value)) {
                        return 'Branch name cannot contain spaces';
                    }
                    return null;
                },
            });

            if (!branchName) {
                return;
            }

            await gitService.checkoutNewBranch(branchName.trim(), commit.hash);
            vscode.window.showInformationMessage(
                `Created and switched to branch "${branchName}" at ${commit.shortHash}.`
            );
        } else {
            await gitService.checkout(commit.hash);
            vscode.window.showWarningMessage(
                `Checked out ${commit.shortHash} in detached HEAD state.`
            );
        }

        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Checkout failed: ${message}`);
    }
}
