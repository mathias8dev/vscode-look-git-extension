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

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.cherryPick', (item?: CommitItem) => {
            handleCherryPick(gitService, historyProvider, item);
        })
    );

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
        vscode.commands.registerCommand('lookGit.revert', (item?: CommitItem) => {
            handleRevert(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.drop', (item?: CommitItem) => {
            handleDrop(gitService, historyProvider, item);
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
        vscode.commands.registerCommand('lookGit.squash', (item?: CommitItem) => {
            handleSquash(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.fixup', (item?: CommitItem) => {
            handleFixup(gitService, historyProvider, item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.copyCommitHash', (item: CommitItem) => {
            vscode.env.clipboard.writeText(item.commitInfo.hash);
            vscode.window.showInformationMessage(`Copied: ${item.commitInfo.shortHash}`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lookGit.viewCommitDetails', (item: CommitItem) => {
            vscode.commands.executeCommand('git.viewCommit', item.commitInfo.hash);
        })
    );
}
