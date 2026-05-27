import * as vscode from 'vscode';
import type { GitService } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import { CommitItem } from '../commitItem';
import { handleCherryPick } from './cherryPick';
import { handleRebase } from './rebase';
import { handleReset } from './reset';
import { handleRevert } from './revert';
import { handleDrop } from './drop';
import { handleRenameCommit } from './renameCommit';
import { handleCheckout } from './checkout';
import { handleSquash } from './squash';
import { handleFixup } from './fixup';
import { handlePushUpTo } from './pushUpTo';
import type { GraphViewProvider } from '../graphView/graphPanel';
import type { ChangesViewProvider } from '../changesView/changesProvider';
import { showModalWarningMessage } from '../utils/confirmation';

// Helper to filter CommitItems from a mixed selection
function filterCommitItems(items?: readonly unknown[]): CommitItem[] | undefined {
    if (!items || items.length === 0) {
        return undefined;
    }
    const commits = items.filter((i): i is CommitItem => i instanceof CommitItem);
    return commits.length > 0 ? commits : undefined;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    graphViewProvider: GraphViewProvider,
    changesViewProvider: ChangesViewProvider,
): void {
    // Focus Git Graph view (user can drag it anywhere in the UI)
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.openGraph', () => {
            return vscode.commands.executeCommand('lookGit.graphView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.refreshHistory', () => {
            historyProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.refreshChanges', () => {
            return changesViewProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.fetchAll', async () => {
            try {
                await gitService.fetchAll();
                await vscode.window.showInformationMessage('Fetched from all remotes.');
                historyProvider.refresh();
                await changesViewProvider.refresh();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Fetch failed: ${msg}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.pull', async () => {
            try {
                await gitService.pull();
                await vscode.window.showInformationMessage('Pull completed.');
                historyProvider.refresh();
                await changesViewProvider.refresh();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Pull failed: ${msg}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.push', async () => {
            try {
                await gitService.push();
                await vscode.window.showInformationMessage('Push completed.');
                historyProvider.refresh();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Push failed: ${msg}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.loadMore', () => {
            return historyProvider.loadMore();
        })
    );

    // Multi-select capable commands
    // VS Code passes (clickedItem, allSelectedItems) for tree context menus

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.cherryPick', (item?: CommitItem, selected?: unknown[]) => {
            return handleCherryPick(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.revert', (item?: CommitItem, selected?: unknown[]) => {
            return handleRevert(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.drop', (item?: CommitItem, selected?: unknown[]) => {
            return handleDrop(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.squash', (item?: CommitItem, selected?: unknown[]) => {
            return handleSquash(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    // Single-select only commands

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.rebase', (item?: CommitItem) => {
            return handleRebase(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.reset', (item?: CommitItem) => {
            return handleReset(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.renameCommit', (item?: CommitItem) => {
            return handleRenameCommit(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.checkout', (item?: CommitItem) => {
            return handleCheckout(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.fixup', (item?: CommitItem) => {
            return handleFixup(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.pushUpTo', (item?: CommitItem) => {
            return handlePushUpTo(gitService, historyProvider, item);
        })
    );

    // Copy commit hash — supports multi-select
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.copyCommitHash', async (item: CommitItem, selected?: unknown[]) => {
            const commits = filterCommitItems(selected);
            if (commits && commits.length > 1) {
                const hashes = commits.map((c) => c.commitInfo.hash).join('\n');
                await vscode.env.clipboard.writeText(hashes);
                await vscode.window.showInformationMessage(`Copied ${commits.length} commit hashes.`);
            } else {
                await vscode.env.clipboard.writeText(item.commitInfo.hash);
                await vscode.window.showInformationMessage(`Copied: ${item.commitInfo.shortHash}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewCommitDetails', (item: CommitItem) => {
            return vscode.commands.executeCommand('git.viewCommit', item.commitInfo.hash);
        })
    );

    // History view mode toggle
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.historyViewAsTree', () => {
            historyProvider.setViewMode(true);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.historyViewAsTreeActive', () => {
            historyProvider.setViewMode(true);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.historyViewAsList', () => {
            historyProvider.setViewMode(false);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.historyViewAsListActive', () => {
            historyProvider.setViewMode(false);
        })
    );

    // Changes view mode toggle
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewAsTree', () => {
            changesViewProvider.setViewMode(true);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewAsTreeActive', () => {
            changesViewProvider.setViewMode(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewAsList', () => {
            changesViewProvider.setViewMode(false);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewAsListActive', () => {
            changesViewProvider.setViewMode(false);
        })
    );

    // Changes view overflow menu commands
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.stageAll', async () => {
            try {
                await gitService.stageAll();
                await changesViewProvider.refresh();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Stage all failed: ${msg}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.unstageAll', async () => {
            try {
                await gitService.unstageAll();
                await changesViewProvider.refresh();
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Unstage all failed: ${msg}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.discardAll', async () => {
            const choice = await showModalWarningMessage(
                'Discard all changes? This cannot be undone.',
                'Discard All',
            );
            if (choice === 'Discard All') {
                try {
                    await gitService.unstageAll().catch(() => undefined);
                    const status = await gitService.getStatus();
                    for (const entry of status.unstaged) {
                        await gitService.discardFile(entry.filePath);
                    }
                    await changesViewProvider.refresh();
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    await vscode.window.showErrorMessage(`Discard all failed: ${msg}`);
                }
            }
        })
    );
}
