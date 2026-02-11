import * as vscode from 'vscode';
import type { GitService } from '../gitService';

export class ChangesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lookGit.changesView';

    private view?: vscode.WebviewView;
    private readonly gitService: GitService;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri, gitService: GitService) {
        this.extensionUri = extensionUri;
        this.gitService = gitService;
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
            (msg) => this.handleMessage(msg),
        );

        this.refresh();
    }

    public async refresh(): Promise<void> {
        if (!this.view) { return; }
        try {
            const status = await this.gitService.getStatus();
            this.view.webview.postMessage({ type: 'statusData', data: status });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.view.webview.postMessage({ type: 'error', message });
        }
    }

    private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
        try {
            switch (msg.type) {
                case 'ready':
                    this.refresh();
                    break;

                case 'stageFile':
                    await this.gitService.stageFile(msg.filePath as string);
                    this.refresh();
                    break;

                case 'unstageFile':
                    await this.gitService.unstageFile(msg.filePath as string);
                    this.refresh();
                    break;

                case 'stageAll':
                    await this.gitService.stageAll();
                    this.refresh();
                    break;

                case 'unstageAll':
                    await this.gitService.unstageAll();
                    this.refresh();
                    break;

                case 'discardFile': {
                    const filePath = msg.filePath as string;
                    const choice = await vscode.window.showWarningMessage(
                        `Discard changes to "${filePath}"? This cannot be undone.`,
                        { modal: true },
                        'Discard',
                    );
                    if (choice === 'Discard') {
                        await this.gitService.discardFile(filePath);
                        this.refresh();
                    }
                    break;
                }

                case 'discardAll': {
                    const choice = await vscode.window.showWarningMessage(
                        'Discard all changes? This cannot be undone.',
                        { modal: true },
                        'Discard All',
                    );
                    if (choice === 'Discard All') {
                        const status = await this.gitService.getStatus();
                        for (const entry of status.unstaged) {
                            await this.gitService.discardFile(entry.filePath);
                        }
                        this.refresh();
                    }
                    break;
                }

                case 'commit': {
                    const message = (msg.message as string || '').trim();
                    if (!message) {
                        vscode.window.showErrorMessage('Commit message cannot be empty.');
                        return;
                    }
                    const mode = (msg.mode as string) || 'commit';
                    switch (mode) {
                        case 'amend':
                            await this.gitService.commitAmend(message);
                            vscode.window.showInformationMessage('Commit amended successfully.');
                            break;
                        case 'commitPush':
                            await this.gitService.commit(message);
                            await this.gitService.push();
                            vscode.window.showInformationMessage('Changes committed and pushed.');
                            break;
                        case 'commitSync':
                            await this.gitService.commit(message);
                            await this.gitService.pullAndPush();
                            vscode.window.showInformationMessage('Changes committed and synced.');
                            break;
                        default:
                            await this.gitService.commit(message);
                            vscode.window.showInformationMessage('Changes committed successfully.');
                            break;
                    }
                    this.refresh();
                    break;
                }

                case 'openDiff': {
                    const filePath = msg.filePath as string;
                    const isStaged = msg.isStaged as boolean;
                    const status = msg.status as string;
                    this.openWorkingDiff(filePath, isStaged, status);
                    break;
                }

                case 'refresh':
                    this.refresh();
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Git operation failed: ${message}`);
            this.refresh();
        }
    }

    private openWorkingDiff(filePath: string, isStaged: boolean, status: string): void {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(`${cwd}/${filePath}`);
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const toGitUri = (uri: vscode.Uri, ref: string): vscode.Uri => {
            const query = JSON.stringify({ path: uri.fsPath, ref });
            return uri.with({ scheme: 'git', path: uri.path, query });
        };

        if (isStaged) {
            // Staged: HEAD vs index
            const leftUri = status === 'A' ? emptyUri : toGitUri(fileUri, 'HEAD');
            const rightUri = toGitUri(fileUri, '');
            vscode.commands.executeCommand(
                'vscode.diff', leftUri, rightUri,
                `${filePath} (Staged)`,
            );
        } else if (status === 'U') {
            // Untracked: just open the file
            vscode.commands.executeCommand('vscode.open', fileUri);
        } else if (status === 'D') {
            // Deleted: show what was in index
            const leftUri = toGitUri(fileUri, '');
            vscode.commands.executeCommand(
                'vscode.diff', leftUri, emptyUri,
                `${filePath} (Deleted)`,
            );
        } else {
            // Modified unstaged: index vs working tree
            const leftUri = toGitUri(fileUri, '');
            vscode.commands.executeCommand(
                'vscode.diff', leftUri, fileUri,
                `${filePath} (Working Tree)`,
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
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
