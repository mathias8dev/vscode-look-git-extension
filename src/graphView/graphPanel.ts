import * as vscode from 'vscode';
import { GraphDataProvider } from './graphDataProvider';
import type { GitService } from '../gitService';

export class GraphViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lookGit.graphView';

    private view?: vscode.WebviewView;
    private readonly dataProvider: GraphDataProvider;
    private readonly gitService: GitService;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri, gitService: GitService) {
        this.extensionUri = extensionUri;
        this.gitService = gitService;
        this.dataProvider = new GraphDataProvider(gitService);
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

    public async refresh(filterBranches?: string[]): Promise<void> {
        if (!this.view) { return; }
        try {
            const data = await this.dataProvider.getGraphData(300, filterBranches);
            this.view.webview.postMessage({ type: 'graphData', data });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.view.webview.postMessage({ type: 'error', message });
        }
    }

    public reveal(): void {
        if (this.view) {
            this.view.show?.(true);
        }
    }

    private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this.refresh();
                break;

            case 'selectBranch': {
                const branches = msg.branches as string[] | undefined;
                this.refresh(branches);
                break;
            }

            case 'getCommitDetails': {
                const hash = msg.hash as string;
                try {
                    const [files, fullMessage] = await Promise.all([
                        this.dataProvider.getCommitFiles(hash),
                        this.dataProvider.getCommitMessage(hash),
                    ]);
                    this.view?.webview.postMessage({
                        type: 'commitDetails',
                        hash,
                        files,
                        fullMessage,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.view?.webview.postMessage({ type: 'error', message });
                }
                break;
            }

            case 'openDiff': {
                const filePath = msg.filePath as string;
                const commitHash = msg.commitHash as string;
                const status = msg.status as string;
                this.openDiff(filePath, commitHash, status);
                break;
            }

            case 'executeCommand': {
                const command = msg.command as string;
                const commitHash = msg.commitHash as string;
                vscode.commands.executeCommand(command, commitHash);
                break;
            }

            case 'executeBranchCommand': {
                const command = msg.command as string;
                const branch = msg.branch as string;
                const isRemote = msg.isRemote as boolean;
                await this.handleBranchCommand(command, branch, isRemote);
                break;
            }

            case 'refresh':
                this.refresh();
                break;
        }
    }

    private async handleBranchCommand(command: string, branch: string, isRemote: boolean): Promise<void> {
        try {
            switch (command) {
                case 'checkout':
                    await this.gitService.checkout(branch);
                    break;

                case 'newBranchFrom': {
                    const name = await vscode.window.showInputBox({
                        prompt: `New branch name (from ${branch})`,
                        placeHolder: 'my-new-branch',
                    });
                    if (!name) { return; }
                    await this.gitService.checkoutNewBranch(name, branch);
                    break;
                }

                case 'checkoutRebaseOnto': {
                    const currentBranch = await this.gitService.getCurrentBranch();
                    await this.gitService.checkout(branch);
                    await this.gitService.rebase(currentBranch);
                    break;
                }

                case 'delete': {
                    const confirmMsg = isRemote
                        ? `Delete remote branch "${branch}"? This cannot be undone.`
                        : `Delete local branch "${branch}"?`;
                    const choice = await vscode.window.showWarningMessage(
                        confirmMsg, { modal: true }, 'Delete',
                    );
                    if (choice !== 'Delete') { return; }

                    if (isRemote) {
                        const slashIdx = branch.indexOf('/');
                        const remote = branch.substring(0, slashIdx);
                        const branchName = branch.substring(slashIdx + 1);
                        await this.gitService.deleteRemoteBranch(remote, branchName);
                    } else {
                        await this.gitService.deleteBranch(branch);
                    }
                    break;
                }

                case 'rename': {
                    const newName = await vscode.window.showInputBox({
                        prompt: `Rename branch "${branch}" to:`,
                        value: branch,
                    });
                    if (!newName || newName === branch) { return; }
                    await this.gitService.renameBranch(branch, newName);
                    break;
                }

                case 'push': {
                    const remotes = await this.gitService.getRemotes();
                    let remote = remotes[0] ?? 'origin';
                    if (remotes.length > 1) {
                        const picked = await vscode.window.showQuickPick(remotes, {
                            placeHolder: 'Select remote to push to',
                        });
                        if (!picked) { return; }
                        remote = picked;
                    }
                    await this.gitService.pushBranch(remote, branch);
                    break;
                }

                case 'update': {
                    const remotes = await this.gitService.getRemotes();
                    const remote = remotes[0] ?? 'origin';
                    await this.gitService.fetchBranch(remote, branch);
                    break;
                }

                case 'rebaseOnto':
                    await this.gitService.rebase(branch);
                    break;

                case 'mergeInto':
                    await this.gitService.merge(branch);
                    break;

                default:
                    return;
            }

            this.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Branch operation failed: ${message}`);
            this.refresh();
        }
    }

    private openDiff(filePath: string, commitHash: string, status: string): void {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(`${cwd}/${filePath}`);
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const toGitUri = (uri: vscode.Uri, ref: string): vscode.Uri => {
            const query = JSON.stringify({ path: uri.fsPath, ref });
            return uri.with({ scheme: 'git', path: uri.path, query });
        };

        let leftUri: vscode.Uri;
        let rightUri: vscode.Uri;

        if (status === 'A') {
            leftUri = emptyUri;
            rightUri = toGitUri(fileUri, commitHash);
        } else if (status === 'D') {
            leftUri = toGitUri(fileUri, `${commitHash}~1`);
            rightUri = emptyUri;
        } else {
            leftUri = toGitUri(fileUri, `${commitHash}~1`);
            rightUri = toGitUri(fileUri, commitHash);
        }

        const title = `${filePath} (${commitHash.substring(0, 7)})`;
        vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    }

    private getHtml(): string {
        const webview = this.view!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'graph.js')
        );
        const nonce = getNonce();

        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Git Graph</title>
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
