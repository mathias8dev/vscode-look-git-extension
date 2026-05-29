import * as vscode from 'vscode';
import type { GitRepository } from '../../core/git/GitRepository';
import type { GraphWebviewToExtensionMessage } from '../../protocol/graph/messages';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { GraphMessageRouter } from '../messaging/GraphMessageRouter';
import { getWebviewHtml } from './webviewHtml';

export class GraphViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.graphView';

    private view?: vscode.WebviewView;
    private router?: GraphMessageRouter;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly repo: GitRepository,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'graph');

        this.router?.dispose();
        this.router = new GraphMessageRouter(this.repo, (msg) => {
            webviewView.webview.postMessage(msg);
        });

        webviewView.webview.onDidReceiveMessage((msg: GraphWebviewToExtensionMessage) => {
            void this.router!.handle(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) { void this.router?.pushGraphData(undefined, undefined); }
        });

        void this.router.pushGraphData(undefined, undefined);
    }

    dispose(): void {
        this.router?.dispose();
    }

    /** Called by RepoRegistry when the active repo changes. */
    async notifyRepoChanged(context: SerializedRepoContext): Promise<void> {
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context });
        await this.router?.pushGraphData(undefined, undefined);
    }
}
