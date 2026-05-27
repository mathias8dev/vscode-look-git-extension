import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

type RepositoryRefreshCallback = () => Promise<void> | void;

export async function handleCheckout(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to checkout');

    if (!commit) {
        return;
    }

    try {
        await gitService.checkoutDetached(commit.hash);
        await vscode.window.showInformationMessage(
            `Checked out ${commit.shortHash} in detached HEAD state.`
        );
        if (refreshRepositoryViews) {
            await refreshRepositoryViews();
        } else {
            historyProvider.refresh();
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Checkout failed: ${message}`);
    }
}
