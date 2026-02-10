import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { selectCommitFromQuickPick } from '../utils/confirmation';

export async function handleCherryPick(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    selectedItems?: CommitItem[]
): Promise<void> {
    // Multi-select: cherry-pick all selected commits (oldest first)
    const items = selectedItems && selectedItems.length > 1 ? selectedItems : undefined;

    if (items) {
        // Reverse so oldest is cherry-picked first (tree shows newest first)
        const commits = [...items].reverse().map((i) => i.commitInfo);
        const hashList = commits.map((c) => c.shortHash).join(', ');

        const confirmed = await vscode.window.showInformationMessage(
            `Cherry-pick ${commits.length} commits (${hashList})?`,
            { modal: true },
            'Cherry-pick'
        );
        if (confirmed !== 'Cherry-pick') {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Cherry-picking ${commits.length} commits...`,
                    cancellable: false,
                },
                async () => {
                    for (const commit of commits) {
                        await gitService.cherryPick(commit.hash);
                    }
                }
            );

            vscode.window.showInformationMessage(
                `Cherry-picked ${commits.length} commits successfully.`
            );
            historyProvider.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('CONFLICT') || message.includes('conflict')) {
                const action = await vscode.window.showErrorMessage(
                    'Cherry-pick resulted in conflicts. Resolve them and commit, or abort.',
                    'Open Source Control',
                    'Abort Cherry-pick'
                );
                if (action === 'Abort Cherry-pick') {
                    await gitService.exec(['cherry-pick', '--abort']);
                    vscode.window.showInformationMessage('Cherry-pick aborted.');
                } else if (action === 'Open Source Control') {
                    vscode.commands.executeCommand('workbench.view.scm');
                }
            } else {
                vscode.window.showErrorMessage(`Cherry-pick failed: ${message}`);
            }
        }
        return;
    }

    // Single select
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to cherry-pick');

    if (!commit) {
        return;
    }

    try {
        await gitService.cherryPick(commit.hash);
        vscode.window.showInformationMessage(
            `Cherry-picked commit ${commit.shortHash}: "${commit.message}"`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('CONFLICT') || message.includes('conflict')) {
            const action = await vscode.window.showErrorMessage(
                `Cherry-pick of ${commit.shortHash} resulted in conflicts. Resolve them and commit, or abort.`,
                'Open Source Control',
                'Abort Cherry-pick'
            );

            if (action === 'Abort Cherry-pick') {
                await gitService.exec(['cherry-pick', '--abort']);
                vscode.window.showInformationMessage('Cherry-pick aborted.');
            } else if (action === 'Open Source Control') {
                vscode.commands.executeCommand('workbench.view.scm');
            }
        } else {
            vscode.window.showErrorMessage(`Cherry-pick failed: ${message}`);
        }
    }
}
