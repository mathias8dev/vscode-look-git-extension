import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ChangesSortPreference, ChangesToolbarCommand, ChangesViewPreference, ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import type { RepoContext } from '../../core/git/domain/RepoContext';
import { ChangesMessageRouter, buildStatusData, emptyStatusData } from '../messaging/ChangesMessageRouter';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import type { RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { createErrorPayload, isAbortError } from '../messaging/errorSerialization';
import { getWebviewHtml } from './webviewHtml';
import { GetChangesStatusUseCase } from '../../application/usecases/changes/get-changes-status';
import { GenerateCommitMessageUseCase } from '../../application/usecases/changes/generate-commit-message';
import { VscodeLanguageModelCommitMessageGenerator } from '../adapters/vscode/vscode-language-model-commit-message-generator';
import { toSerializedRepoContext } from '../mapping/toProtocol';
import { webviewFontSizeMessage } from './webview-font';

const CHANGES_TOOLBAR_COMMANDS: readonly { readonly id: string; readonly command: ChangesToolbarCommand }[] = [
    { id: 'lookGit.changes.openGraph', command: 'openGraph' },
    { id: 'lookGit.changes.pull', command: 'pull' },
    { id: 'lookGit.changes.push', command: 'push' },
    { id: 'lookGit.changes.clone', command: 'clone' },
    { id: 'lookGit.changes.checkout', command: 'checkout' },
    { id: 'lookGit.changes.fetch', command: 'fetch' },
    { id: 'lookGit.changes.sync', command: 'sync' },
    { id: 'lookGit.changes.pullRebase', command: 'pullRebase' },
    { id: 'lookGit.changes.pullFrom', command: 'pullFrom' },
    { id: 'lookGit.changes.pushForce', command: 'pushForce' },
    { id: 'lookGit.changes.pushTo', command: 'pushTo' },
    { id: 'lookGit.changes.pushToForce', command: 'pushToForce' },
    { id: 'lookGit.changes.fetchPrune', command: 'fetchPrune' },
    { id: 'lookGit.changes.fetchAll', command: 'fetchAll' },
    { id: 'lookGit.changes.undoLastCommit', command: 'undoLastCommit' },
    { id: 'lookGit.changes.abortRebase', command: 'abortRebase' },
    { id: 'lookGit.changes.mergeBranch', command: 'mergeBranch' },
    { id: 'lookGit.changes.rebaseBranch', command: 'rebaseBranch' },
    { id: 'lookGit.changes.createBranch', command: 'createBranch' },
    { id: 'lookGit.changes.createBranchFrom', command: 'createBranchFrom' },
    { id: 'lookGit.changes.renameBranch', command: 'renameBranch' },
    { id: 'lookGit.changes.deleteBranch', command: 'deleteBranch' },
    { id: 'lookGit.changes.deleteRemoteBranch', command: 'deleteRemoteBranch' },
    { id: 'lookGit.changes.publishBranch', command: 'publishBranch' },
    { id: 'lookGit.changes.addRemote', command: 'addRemote' },
    { id: 'lookGit.changes.removeRemote', command: 'removeRemote' },
    { id: 'lookGit.changes.stash', command: 'stash' },
    { id: 'lookGit.changes.stashIncludeUntracked', command: 'stashIncludeUntracked' },
    { id: 'lookGit.changes.stashStaged', command: 'stashStaged' },
    { id: 'lookGit.changes.applyLatestStash', command: 'applyLatestStash' },
    { id: 'lookGit.changes.applyStash', command: 'applyStash' },
    { id: 'lookGit.changes.popLatestStash', command: 'popLatestStash' },
    { id: 'lookGit.changes.popStash', command: 'popStash' },
    { id: 'lookGit.changes.dropStash', command: 'dropStash' },
    { id: 'lookGit.changes.dropAllStashes', command: 'dropAllStashes' },
    { id: 'lookGit.changes.viewStash', command: 'viewStash' },
    { id: 'lookGit.changes.createTag', command: 'createTag' },
    { id: 'lookGit.changes.deleteTag', command: 'deleteTag' },
    { id: 'lookGit.changes.deleteRemoteTag', command: 'deleteRemoteTag' },
    { id: 'lookGit.changes.pushTags', command: 'pushTags' },
    { id: 'lookGit.changes.showGitOutput', command: 'showGitOutput' },
];

const CHANGES_VIEW_COMMANDS: readonly { readonly id: string; readonly viewMode: ChangesViewPreference }[] = [
    { id: 'lookGit.changes.viewAsList', viewMode: 'list' },
    { id: 'lookGit.changes.viewAsTree', viewMode: 'tree' },
];

const CHANGES_SORT_COMMANDS: readonly { readonly id: string; readonly sortMode: ChangesSortPreference }[] = [
    { id: 'lookGit.changes.sortByName', sortMode: 'name' },
    { id: 'lookGit.changes.sortByPath', sortMode: 'path' },
    { id: 'lookGit.changes.sortByStatus', sortMode: 'status' },
];

const CHANGES_BULK_COMMANDS: readonly { readonly id: string; readonly message: ChangesWebviewToExtensionMessage }[] = [
    { id: 'lookGit.changes.stageAllChanges', message: { type: 'changes/stageAll' } },
    { id: 'lookGit.changes.unstageAllChanges', message: { type: 'changes/unstageAll' } },
    { id: 'lookGit.changes.discardAllChanges', message: { type: 'changes/discardAll' } },
];

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
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
        private readonly getChangesStatus = new GetChangesStatusUseCase(),
        private readonly generateCommitMessage = new GenerateCommitMessageUseCase(new VscodeLanguageModelCommitMessageGenerator()),
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        this.renderWebviewHtml(webviewView);

        this.router = new ChangesMessageRouter(this.repositories, (msg) => {
            webviewView.webview.postMessage(msg);
        }, () => this.refresh(), this.onRepositoryUpdated, this.remoteCommands, this.generateCommitMessage);

        webviewView.webview.onDidReceiveMessage((msg: ChangesWebviewToExtensionMessage) => {
            void this.router!.handle(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.pendingRefresh) {
                this.scheduleRefresh();
            }
        });

        void this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        void this.commands.executeCommand('setContext', 'lookGit.changesViewAsTree', this.viewAsTree);
        void this.commands.executeCommand('setContext', 'lookGit.changesSortMode', 'path');
        this.scheduleRefresh();
    }

    // Injected to allow mocking in tests
    private get commands() { return vscode.commands; }

    registerNativeContextCommands(): readonly vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('lookGit.changes.refresh', () => this.refresh()),
            ...CHANGES_TOOLBAR_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runToolbarCommand(command))),
            ...CHANGES_VIEW_COMMANDS.map(({ id, viewMode }) => vscode.commands.registerCommand(id, () => this.applyViewMode(viewMode))),
            ...CHANGES_SORT_COMMANDS.map(({ id, sortMode }) => vscode.commands.registerCommand(id, () => this.applySortMode(sortMode))),
            ...CHANGES_BULK_COMMANDS.map(({ id, message }) => vscode.commands.registerCommand(id, () => this.runChangesCommand(message))),
            vscode.commands.registerCommand('lookGit.changes.commit', () => this.focusCommitComposer()),
            vscode.commands.registerCommand('lookGit.changes.commitStaged', () => this.focusCommitComposer()),
            vscode.commands.registerCommand('lookGit.changes.commitAll', () => this.stageAllThenFocusCommitComposer()),
            vscode.commands.registerCommand('lookGit.changes.commitAmend', () => this.focusCommitComposer()),
            vscode.commands.registerCommand('lookGit.changes.commitStagedAmend', () => this.focusCommitComposer()),
            vscode.commands.registerCommand('lookGit.changes.commitAllAmend', () => this.stageAllThenFocusCommitComposer()),
        ];
    }

    private async runToolbarCommand(command: ChangesToolbarCommand): Promise<void> {
        await this.router?.handleToolbarCommand(command);
    }

    private async runChangesCommand(message: ChangesWebviewToExtensionMessage): Promise<void> {
        await this.router?.handle(message);
    }

    private async applyViewMode(viewMode: ChangesViewPreference): Promise<void> {
        this.viewAsTree = viewMode === 'tree';
        await this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        await this.commands.executeCommand('setContext', 'lookGit.changesViewAsTree', this.viewAsTree);
        this.view?.webview.postMessage({ type: 'changes/applyViewMode', viewMode });
    }

    private async applySortMode(sortMode: ChangesSortPreference): Promise<void> {
        await this.commands.executeCommand('setContext', 'lookGit.changesSortMode', sortMode);
        this.view?.webview.postMessage({ type: 'changes/applySortMode', sortMode });
    }

    private focusCommitComposer(): void {
        this.view?.webview.postMessage({ type: 'changes/focusCommitComposer' });
    }

    private async stageAllThenFocusCommitComposer(): Promise<void> {
        await this.router?.handle({ type: 'changes/stageAll' });
        this.focusCommitComposer();
    }

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
                    this.router?.setKnownSubmodulePaths([]);
                    this.updateBadge(0);
                    this.view.webview.postMessage(emptyStatusData());
                    continue;
                }

                const { status, stashes, submodules } = await this.getChangesStatus.execute(repo, controller.signal);
                this.router?.setKnownSubmodulePaths(submodules.map((submodule) => submodule.path));
                this.updateBadge(status.staged.length + status.unstaged.length + status.conflicts.length);
                this.view.webview.postMessage(buildStatusData(status, stashes, submodules));
            } catch (error) {
                if (isAbortError(error)) { continue; }
                this.updateBadge(0);
                this.view.webview.postMessage({
                    type: 'changes/error',
                    ...createErrorPayload(error, {
                        code: 'refreshFailed',
                        operation: 'changes/refresh',
                        recoverable: true,
                    }),
                });
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
    async notifyRepoChanged(context: RepoContext): Promise<void> {
        this.router?.setKnownSubmodulePaths([]);
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context: toSerializedRepoContext(context) });
        this.scheduleRefresh();
    }

    notifyFontSizeChanged(): void {
        void this.view?.webview.postMessage(webviewFontSizeMessage());
    }

    private renderWebviewHtml(webviewView: vscode.WebviewView): void {
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'changes');
    }
}
