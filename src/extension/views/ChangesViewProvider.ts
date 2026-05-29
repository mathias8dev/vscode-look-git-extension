import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { ChangesMessageRouter, buildStatusData, emptyStatusData } from '../messaging/ChangesMessageRouter';
import { createErrorPayload } from '../messaging/errorSerialization';
import { getWebviewHtml } from './webviewHtml';

export class ChangesViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.changesView';

    private view?: vscode.WebviewView;
    private router?: ChangesMessageRouter;
    private pendingRefresh = false;
    private refreshPromise?: Promise<void>;
    private viewAsTree = true;

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
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'changes');

        this.router = new ChangesMessageRouter(this.repositories, (msg) => {
            webviewView.webview.postMessage(msg);
        }, () => this.refresh());

        webviewView.webview.onDidReceiveMessage((msg: ChangesWebviewToExtensionMessage) => {
            void this.router!.handle(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.pendingRefresh) {
                void this.refresh();
            }
        });

        void this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        void this.refresh();
    }

    // Injected to allow mocking in tests
    private get commands() { return vscode.commands; }

    async refresh(): Promise<void> {
        if (!this.view) { return; }
        this.pendingRefresh = true;
        if (this.refreshPromise) { await this.refreshPromise; return; }

        this.refreshPromise = this.doRefresh();
        try { await this.refreshPromise; }
        finally { this.refreshPromise = undefined; }
    }

    private async doRefresh(): Promise<void> {
        while (this.view && this.pendingRefresh) {
            this.pendingRefresh = false;
            try {
                const repo = this.repositories.currentRepository;
                if (!repo) {
                    this.updateBadge(0);
                    if (this.view.visible) {
                        this.view.webview.postMessage(emptyStatusData());
                    }
                    continue;
                }

                const [status, stashes] = await Promise.all([
                    repo.getStatus(),
                    repo.stashList(),
                ]);
                this.updateBadge(status.staged.length + status.unstaged.length + status.conflicts.length);
                if (this.view.visible) {
                    this.view.webview.postMessage(buildStatusData(status, stashes));
                }
            } catch (error) {
                this.updateBadge(0);
                if (this.view.visible) {
                    this.view.webview.postMessage({
                        type: 'changes/error',
                        ...createErrorPayload(error, {
                            code: 'refreshFailed',
                            operation: 'changes/refresh',
                            recoverable: true,
                        }),
                    });
                }
            }
        }
    }

    private updateBadge(count: number): void {
        if (this.view) {
            this.view.badge = { value: count, tooltip: `${count} change${count !== 1 ? 's' : ''}` };
        }
    }

    /** Called by RepoRegistry when the active repo changes. */
    async notifyRepoChanged(context: SerializedRepoContext): Promise<void> {
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context });
        await this.refresh();
    }
}
