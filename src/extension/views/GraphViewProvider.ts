import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
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
        private readonly repositories: ActiveRepositoryAccessor,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'graph');

        this.router?.dispose();
        this.router = new GraphMessageRouter(this.repositories, (msg) => {
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
        await this.refresh();
    }

    async refresh(): Promise<void> {
        await this.router?.pushGraphData(undefined, undefined);
    }
}
