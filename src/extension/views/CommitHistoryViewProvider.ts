import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import type { HistoryExtensionToWebviewMessage } from '../../protocol/history/messages';
import { createErrorPayload } from '../messaging/errorSerialization';
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
        if (!this.view) { return; }

        const repo = this.repositories.currentRepository;
        if (!repo) {
            this.postMessage({ type: 'history/data', commits: [] });
            return;
        }

        try {
            const commits = await repo.getLog(50, 0);
            this.postMessage({
                type: 'history/data',
                commits: commits.map((commit) => ({
                    hash: commit.hash,
                    shortHash: commit.shortHash,
                    message: commit.message,
                    authorName: commit.authorName,
                    authorDate: commit.authorDate,
                })),
            });
        } catch (error) {
            this.postMessage({
                type: 'history/error',
                ...createErrorPayload(error, {
                    code: 'refreshFailed',
                    operation: 'history/refresh',
                    recoverable: true,
                }),
            });
        }
    }

    async notifyRepoChanged(context: SerializedRepoContext): Promise<void> {
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context });
        await this.refresh();
    }

    private postMessage(message: HistoryExtensionToWebviewMessage): void {
        void this.view?.webview.postMessage(message);
    }
}
