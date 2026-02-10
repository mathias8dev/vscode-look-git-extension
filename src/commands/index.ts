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
    historyProvider: CommitHistoryProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.refreshHistory', () => {
            historyProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.loadMore', () => {
            historyProvider.loadMore();
        })
    );

    // Multi-select capable commands
    // VS Code passes (clickedItem, allSelectedItems) for tree context menus

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.cherryPick', (item?: CommitItem, selected?: unknown[]) => {
            handleCherryPick(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.revert', (item?: CommitItem, selected?: unknown[]) => {
            handleRevert(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.drop', (item?: CommitItem, selected?: unknown[]) => {
            handleDrop(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.squash', (item?: CommitItem, selected?: unknown[]) => {
            handleSquash(gitService, historyProvider, item, filterCommitItems(selected));
        })
    );

    // Single-select only commands

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.rebase', (item?: CommitItem) => {
            handleRebase(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.reset', (item?: CommitItem) => {
            handleReset(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.renameCommit', (item?: CommitItem) => {
            handleRenameCommit(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.checkout', (item?: CommitItem) => {
            handleCheckout(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.fixup', (item?: CommitItem) => {
            handleFixup(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.pushUpTo', (item?: CommitItem) => {
            handlePushUpTo(gitService, historyProvider, item);
        })
    );

    // Copy commit hash — supports multi-select
    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.copyCommitHash', (item: CommitItem, selected?: unknown[]) => {
            const commits = filterCommitItems(selected);
            if (commits && commits.length > 1) {
                const hashes = commits.map((c) => c.commitInfo.hash).join('\n');
                vscode.env.clipboard.writeText(hashes);
                vscode.window.showInformationMessage(`Copied ${commits.length} commit hashes.`);
            } else {
                vscode.env.clipboard.writeText(item.commitInfo.hash);
                vscode.window.showInformationMessage(`Copied: ${item.commitInfo.shortHash}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewCommitDetails', (item: CommitItem) => {
            vscode.commands.executeCommand('git.viewCommit', item.commitInfo.hash);
        })
    );
}
