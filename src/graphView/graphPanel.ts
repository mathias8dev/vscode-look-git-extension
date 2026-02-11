import * as vscode from 'vscode';
import { GraphDataProvider } from './graphDataProvider';
import type { GitService } from '../gitService';

export class GraphPanel {
    public static currentPanel: GraphPanel | undefined;
    private static readonly viewType = 'lookGit.graphView';

    private readonly panel: vscode.WebviewPanel;
    private readonly dataProvider: GraphDataProvider;
    private readonly gitService: GitService;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService,
    ): GraphPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (GraphPanel.currentPanel) {
            GraphPanel.currentPanel.panel.reveal(column);
            GraphPanel.currentPanel.refresh();
            return GraphPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            GraphPanel.viewType,
            'Git Graph',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
                ],
            }
        );

        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, gitService);
        return GraphPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService,
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.gitService = gitService;
        this.dataProvider = new GraphDataProvider(gitService);

        this.panel.webview.html = this.getHtml();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            null,
            this.disposables,
        );

        // Send initial data once webview is ready
        this.refresh();
    }

    public async refresh(filterBranches?: string[]): Promise<void> {
        try {
            const data = await this.dataProvider.getGraphData(300, filterBranches);
            this.panel.webview.postMessage({ type: 'graphData', data });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.panel.webview.postMessage({ type: 'error', message });
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
                    this.panel.webview.postMessage({
                        type: 'commitDetails',
                        hash,
                        files,
                        fullMessage,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.panel.webview.postMessage({ type: 'error', message });
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

            case 'refresh':
                this.refresh();
                break;
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
        const webview = this.panel.webview;
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

    private dispose(): void {
        GraphPanel.currentPanel = undefined;
        this.panel.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
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
