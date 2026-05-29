import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { getWebviewHtml } from './webviewHtml';

export class CommitHistoryViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.commitHistory';

    private view?: vscode.WebviewView;

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
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'history');

        void this.refresh();
    }

    async refresh(): Promise<void> {
        const repo = this.repositories.currentRepository;
        if (!this.view || !repo) { return; }

        const commits = await repo.getLog(50, 0);
        this.view.webview.postMessage({
            type: 'history/data',
            commits: commits.map((commit) => ({
                hash: commit.hash,
                shortHash: commit.shortHash,
                message: commit.message,
                authorName: commit.authorName,
                authorDate: commit.authorDate,
            })),
        });
    }

    async notifyRepoChanged(context: SerializedRepoContext): Promise<void> {
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context });
        await this.refresh();
    }
}
