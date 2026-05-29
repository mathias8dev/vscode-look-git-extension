import * as vscode from 'vscode';
import type { GitRepository, GitSubmodule } from '../../core/git/GitRepository';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { ChangesMessageRouter, buildStatusData, emptyStatusData } from '../messaging/ChangesMessageRouter';
import { createErrorPayload, isAbortError } from '../messaging/errorSerialization';
import { getWebviewHtml } from './webviewHtml';

export class ChangesViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.changesView';

    private view?: vscode.WebviewView;
    private router?: ChangesMessageRouter;
    private pendingRefresh = false;
    private refreshPromise?: Promise<void>;
    private refreshAbortController?: AbortController;
    private refreshTimer?: ReturnType<typeof setTimeout>;
    private viewAsTree = true;
    private readonly refreshDebounceMs = 50;

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
                this.scheduleRefresh();
            }
        });

        void this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        this.scheduleRefresh();
    }

    // Injected to allow mocking in tests
    private get commands() { return vscode.commands; }

    async refresh(): Promise<void> {
        if (!this.view) { return; }
        this.pendingRefresh = true;
        this.refreshAbortController?.abort();
        if (this.refreshPromise) { await this.refreshPromise; return; }

        this.refreshPromise = this.doRefresh();
        try { await this.refreshPromise; }
        finally { this.refreshPromise = undefined; }
    }

    private scheduleRefresh(): void {
        this.pendingRefresh = true;
        if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.refresh();
        }, this.refreshDebounceMs);
    }

    private async doRefresh(): Promise<void> {
        while (this.view && this.pendingRefresh) {
            this.pendingRefresh = false;
            const controller = new AbortController();
            this.refreshAbortController = controller;
            try {
                const repo = this.repositories.currentRepository;
                if (!repo) {
                    this.updateBadge(0);
                    if (this.view.visible) {
                        this.view.webview.postMessage(emptyStatusData());
                    }
                    continue;
                }

                const [status, stashes, submodules] = await Promise.all([
                    repo.getStatus(controller.signal),
                    repo.stashList(controller.signal),
                    optionalSubmodules(repo, controller.signal),
                ]);
                this.updateBadge(status.staged.length + status.unstaged.length + status.conflicts.length);
                if (this.view.visible) {
                    this.view.webview.postMessage(buildStatusData(status, stashes, submodules));
                }
            } catch (error) {
                if (isAbortError(error)) { continue; }
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
            } finally {
                if (this.refreshAbortController === controller) {
                    this.refreshAbortController = undefined;
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
        this.scheduleRefresh();
    }
}

async function optionalSubmodules(repo: GitRepository, signal: AbortSignal): Promise<readonly GitSubmodule[]> {
    try {
        return await repo.getSubmoduleStatus(signal);
    } catch (error) {
        if (isAbortError(error)) { throw error; }
        return [];
    }
}
