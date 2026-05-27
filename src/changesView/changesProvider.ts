import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import type { GitService } from '../gitService';
import { showModalWarningMessage } from '../utils/confirmation';

export class ChangesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lookGit.changesView';

    private view?: vscode.WebviewView;
    private readonly gitService: GitService;
    private readonly extensionUri: vscode.Uri;
    private viewAsTree = false;
    private pendingRefresh = false;
    private refreshPromise?: Promise<void>;

    constructor(extensionUri: vscode.Uri, gitService: GitService) {
        this.extensionUri = extensionUri;
        this.gitService = gitService;
    }

    public setViewMode(asTree: boolean): void {
        this.viewAsTree = asTree;
        void vscode.commands.executeCommand('setContext', 'lookGit.viewAsTree', asTree);
        this.view?.webview.postMessage({ type: 'setViewMode', asTree });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
            ],
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(
            (msg) => {
                void this.handleMessage(msg);
            },
        );

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.pendingRefresh) {
                void this.refresh();
            }
        });

        void this.refresh();
    }

    public async refresh(): Promise<void> {
        if (!this.view) { return; }
        this.pendingRefresh = true;

        if (!this.view.visible) {
            return;
        }

        if (this.refreshPromise) {
            await this.refreshPromise;
            return;
        }

        this.refreshPromise = this.drainRefreshQueue();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = undefined;
        }
    }

    private async drainRefreshQueue(): Promise<void> {
        while (this.view?.visible && this.pendingRefresh) {
            this.pendingRefresh = false;
            await this.postStatusData();
        }
    }

    private async postStatusData(): Promise<void> {
        if (!this.view) { return; }
        try {
            const [status, stashes] = await Promise.all([
                this.gitService.getStatus(),
                this.gitService.stashList(),
            ]);
            this.view.webview.postMessage({ type: 'statusData', data: { ...status, stashes } });

            // Show total change count as a badge on the view
            const total = status.staged.length + status.unstaged.length + status.conflicts.length;
            this.view.badge = total > 0
                ? { value: total, tooltip: `${total} change${total !== 1 ? 's' : ''}` }
                : undefined;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.view.webview.postMessage({ type: 'error', message });
        }
    }

    private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
        try {
            switch (msg.type) {
                case 'ready':
                    await this.refresh();
                    break;

                case 'viewModeChanged': {
                    const asTree = msg.asTree as boolean;
                    this.viewAsTree = asTree;
                    await vscode.commands.executeCommand('setContext', 'lookGit.viewAsTree', asTree);
                    break;
                }

                case 'stageFile':
                    await this.gitService.stageFile(msg.filePath as string);
                    await this.refresh();
                    break;

                case 'unstageFile':
                    await this.gitService.unstageFile(msg.filePath as string);
                    await this.refresh();
                    break;

                case 'stageAll':
                    await this.gitService.stageAll();
                    await this.refresh();
                    break;

                case 'unstageAll':
                    await this.gitService.unstageAll();
                    await this.refresh();
                    break;

                case 'discardFile': {
                    const filePath = msg.filePath as string;
                    const choice = await showModalWarningMessage(
                        `Discard changes to "${filePath}"? This cannot be undone.`,
                        'Discard',
                    );
                    if (choice === 'Discard') {
                        await this.gitService.discardFile(filePath);
                        await this.refresh();
                    }
                    break;
                }

                case 'discardAll': {
                    const choice = await showModalWarningMessage(
                        'Discard all changes? This cannot be undone.',
                        'Discard All',
                    );
                    if (choice === 'Discard All') {
                        await this.gitService.unstageAll().catch(() => undefined);
                        const status = await this.gitService.getStatus();
                        for (const entry of status.unstaged) {
                            await this.gitService.discardFile(entry.filePath);
                        }
                        await this.refresh();
                    }
                    break;
                }

                case 'commit': {
                    const message = (msg.message as string || '').trim();
                    if (!message) {
                        await vscode.window.showErrorMessage('Commit message cannot be empty.');
                        this.view?.webview.postMessage({ type: 'commitResult', success: false });
                        return;
                    }
                    const mode = (msg.mode as string) || 'commit';
                    switch (mode) {
                        case 'amend':
                            await this.gitService.commitAmend(message);
                            await vscode.window.showInformationMessage('Commit amended successfully.');
                            break;
                        case 'commitPush':
                            await this.gitService.commit(message);
                            await this.gitService.push();
                            await vscode.window.showInformationMessage('Changes committed and pushed.');
                            break;
                        case 'commitSync':
                            await this.gitService.commit(message);
                            await this.gitService.pullAndPush();
                            await vscode.window.showInformationMessage('Changes committed and synced.');
                            break;
                        default:
                            await this.gitService.commit(message);
                            await vscode.window.showInformationMessage('Changes committed successfully.');
                            break;
                    }
                    await this.refresh();
                    this.view?.webview.postMessage({ type: 'commitResult', success: true });
                    break;
                }

                case 'openFile': {
                    const filePath = msg.filePath as string;
                    const cwd = this.gitService.getWorkingDirectory();
                    const fileUri = vscode.Uri.file(path.join(cwd, filePath));
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                    break;
                }

                case 'openDiff': {
                    const filePath = msg.filePath as string;
                    const origPath = msg.origPath as string | undefined;
                    const isStaged = msg.isStaged as boolean;
                    const status = msg.status as string;
                    await this.openWorkingDiff(filePath, isStaged, status, origPath);
                    break;
                }

                case 'openMergeEditor': {
                    const filePath = msg.filePath as string;
                    const cwd = this.gitService.getWorkingDirectory();
                    const fileUri = vscode.Uri.file(path.join(cwd, filePath));
                    try {
                        await vscode.commands.executeCommand('merge-conflict.accept.select', fileUri);
                    } catch {
                        // Fallback: open the file so VS Code shows inline conflict decorations
                        await vscode.commands.executeCommand('vscode.open', fileUri);
                    }
                    break;
                }

                case 'acceptOurs': {
                    const filePath = msg.filePath as string;
                    await this.gitService.acceptOurs(filePath);
                    await this.gitService.stageFile(filePath);
                    await this.refresh();
                    break;
                }

                case 'acceptTheirs': {
                    const filePath = msg.filePath as string;
                    await this.gitService.acceptTheirs(filePath);
                    await this.gitService.stageFile(filePath);
                    await this.refresh();
                    break;
                }

                case 'acceptAllTheirs': {
                    const status = await this.gitService.getStatus();
                    for (const entry of status.conflicts) {
                        await this.gitService.acceptTheirs(entry.filePath);
                        await this.gitService.stageFile(entry.filePath);
                    }
                    await this.refresh();
                    break;
                }

                case 'markResolved': {
                    const filePath = msg.filePath as string;
                    await this.gitService.stageFile(filePath);
                    await this.refresh();
                    break;
                }

                case 'continueOp': {
                    const state = msg.conflictState as string;
                    if (state === 'merge') {
                        await this.gitService.mergeContinue();
                        await vscode.window.showInformationMessage('Merge completed.');
                    } else if (state === 'rebase') {
                        await this.gitService.rebaseContinue();
                        await vscode.window.showInformationMessage('Rebase step completed.');
                    }
                    await this.refresh();
                    break;
                }

                case 'abortOp': {
                    const state = msg.conflictState as string;
                    const label = state === 'merge' ? 'merge' : 'rebase';
                    const choice = await showModalWarningMessage(
                        `Abort the current ${label}?`,
                        'Abort',
                    );
                    if (choice === 'Abort') {
                        if (state === 'merge') {
                            await this.gitService.mergeAbort();
                        } else if (state === 'rebase') {
                            await this.gitService.rebaseAbort();
                        }
                        await vscode.window.showInformationMessage(`${label.charAt(0).toUpperCase() + label.slice(1)} aborted.`);
                        await this.refresh();
                    }
                    break;
                }

                case 'stashStaged': {
                    const stashMsg = (msg.message as string || '').trim() || undefined;
                    await this.gitService.stashStaged(stashMsg);
                    await vscode.window.showInformationMessage('Staged changes stashed.');
                    await this.refresh();
                    break;
                }

                case 'stash': {
                    const stashMsg = (msg.message as string || '').trim() || undefined;
                    await this.gitService.stash(stashMsg);
                    await vscode.window.showInformationMessage('Changes stashed.');
                    await this.refresh();
                    break;
                }

                case 'stashPop': {
                    const index = msg.index as number;
                    await this.gitService.stashPop(index);
                    await vscode.window.showInformationMessage('Stash popped.');
                    await this.refresh();
                    break;
                }

                case 'stashApply': {
                    const index = msg.index as number;
                    await this.gitService.stashApply(index);
                    await vscode.window.showInformationMessage('Stash applied.');
                    await this.refresh();
                    break;
                }

                case 'stashDrop': {
                    const index = msg.index as number;
                    const choice = await showModalWarningMessage(
                        `Drop stash@{${index}}? This cannot be undone.`,
                        'Drop',
                    );
                    if (choice === 'Drop') {
                        await this.gitService.stashDrop(index);
                        await vscode.window.showInformationMessage('Stash dropped.');
                        await this.refresh();
                    }
                    break;
                }

                case 'getStashFiles': {
                    const index = msg.index as number;
                    const files = await this.gitService.getStashFiles(index);
                    this.view!.webview.postMessage({
                        type: 'stashFiles',
                        index,
                        files,
                    });
                    break;
                }

                case 'openStashDiff': {
                    const filePath = msg.filePath as string;
                    const origPath = msg.origPath as string | undefined;
                    const stashIndex = msg.index as number;
                    const status = msg.status as string;
                    await this.openStashDiff(filePath, stashIndex, status, origPath);
                    break;
                }

                case 'refresh':
                    await this.refresh();
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(`Git operation failed: ${message}`);
            if (msg.type === 'commit') {
                this.view?.webview.postMessage({ type: 'commitResult', success: false });
            }
            await this.refresh();
        }
    }

    private async openWorkingDiff(filePath: string, isStaged: boolean, status: string, origPath?: string): Promise<void> {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, filePath));
        const originalFileUri = vscode.Uri.file(path.join(cwd, origPath ?? filePath));
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const toGitUri = (uri: vscode.Uri, ref: string): vscode.Uri => {
            const query = JSON.stringify({ path: uri.fsPath, ref });
            return uri.with({ scheme: 'git', path: uri.path, query });
        };

        if (isStaged) {
            // Staged: HEAD vs index
            const leftUri = status === 'A' ? emptyUri : toGitUri(originalFileUri, 'HEAD');
            const rightUri = toGitUri(fileUri, '');
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, rightUri,
                `${filePath} (Staged)`,
            );
        } else if (status === 'U') {
            // Untracked: just open the file
            await vscode.commands.executeCommand('vscode.open', fileUri);
        } else if (status === 'D') {
            // Deleted: show what was in index
            const leftUri = toGitUri(originalFileUri, '');
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, emptyUri,
                `${filePath} (Deleted)`,
            );
        } else {
            // Modified unstaged: index vs working tree
            const leftUri = toGitUri(originalFileUri, '');
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, fileUri,
                `${filePath} (Working Tree)`,
            );
        }
    }

    private async openStashDiff(filePath: string, stashIndex: number, status: string, origPath?: string): Promise<void> {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, filePath));
        const originalFileUri = vscode.Uri.file(path.join(cwd, origPath ?? filePath));
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const toGitUri = (uri: vscode.Uri, ref: string): vscode.Uri => {
            const query = JSON.stringify({ path: uri.fsPath, ref });
            return uri.with({ scheme: 'git', path: uri.path, query });
        };

        const stashRef = `stash@{${stashIndex}}`;
        const parentRef = `stash@{${stashIndex}}^`;

        if (status === 'A') {
            const rightUri = toGitUri(fileUri, stashRef);
            await vscode.commands.executeCommand(
                'vscode.diff', emptyUri, rightUri,
                `${filePath} (Stash #${stashIndex})`,
            );
        } else if (status === 'D') {
            const leftUri = toGitUri(originalFileUri, parentRef);
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, emptyUri,
                `${filePath} (Stash #${stashIndex} - Deleted)`,
            );
        } else {
            const leftUri = toGitUri(originalFileUri, parentRef);
            const rightUri = toGitUri(fileUri, stashRef);
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, rightUri,
                `${filePath} (Stash #${stashIndex})`,
            );
        }
    }

    private getHtml(): string {
        const webview = this.view!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'changes.js'),
        );
        const nonce = getNonce();

        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>Changes</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
}
