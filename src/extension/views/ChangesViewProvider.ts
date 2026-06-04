import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ChangesSortPreference, ChangesToolbarCommand, ChangesViewPreference, ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import { CommitMode, type ChangesContextTarget } from '../../protocol/changes/types';
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

enum ChangesCommandScope {
    ActiveRepository,
    Submodule,
}

enum ChangesCommandKind {
    Toolbar,
    StageAll,
    UnstageAll,
    DiscardAll,
    FocusCommit,
    StageAllThenFocusCommit,
}

interface ChangesCommandDescriptor {
    readonly id: string;
    readonly scope: ChangesCommandScope;
    readonly kind: ChangesCommandKind;
    readonly toolbarCommand: ChangesToolbarCommand | undefined;
}

interface ChangesCommitComposerCommandDescriptor {
    readonly id: string;
    readonly mode: CommitMode;
}

const SHARED_TOOLBAR_COMMANDS: readonly ChangesToolbarCommand[] = [
    'pull',
    'push',
    'clone',
    'checkout',
    'fetch',
    'sync',
    'pullRebase',
    'pullFrom',
    'pushForce',
    'pushTo',
    'pushToForce',
    'fetchPrune',
    'fetchAll',
    'undoLastCommit',
    'abortRebase',
    'mergeBranch',
    'rebaseBranch',
    'createBranch',
    'createBranchFrom',
    'renameBranch',
    'deleteBranch',
    'deleteRemoteBranch',
    'publishBranch',
    'addRemote',
    'removeRemote',
    'stash',
    'stashIncludeUntracked',
    'stashStaged',
    'applyLatestStash',
    'applyStash',
    'popLatestStash',
    'popStash',
    'dropStash',
    'dropAllStashes',
    'viewStash',
    'createTag',
    'deleteTag',
    'deleteRemoteTag',
    'pushTags',
    'showGitOutput',
];

const REPOSITORY_TOOLBAR_COMMANDS: readonly ChangesToolbarCommand[] = ['openGraph', ...SHARED_TOOLBAR_COMMANDS];
const SUBMODULE_TOOLBAR_COMMANDS = SHARED_TOOLBAR_COMMANDS;

const CHANGES_VIEW_COMMANDS: readonly { readonly ids: readonly string[]; readonly viewMode: ChangesViewPreference }[] = [
    { ids: ['lookGit.changes.viewAsList', 'lookGit.changes.viewAsListChecked'], viewMode: 'list' },
    { ids: ['lookGit.changes.viewAsTree', 'lookGit.changes.viewAsTreeChecked'], viewMode: 'tree' },
];

const CHANGES_SORT_COMMANDS: readonly { readonly ids: readonly string[]; readonly sortMode: ChangesSortPreference }[] = [
    { ids: ['lookGit.changes.sortByPath', 'lookGit.changes.sortByPathChecked'], sortMode: 'path' },
    { ids: ['lookGit.changes.sortByName', 'lookGit.changes.sortByNameChecked'], sortMode: 'name' },
    { ids: ['lookGit.changes.sortByStatus', 'lookGit.changes.sortByStatusChecked'], sortMode: 'status' },
    { ids: ['lookGit.changes.sortByExtension', 'lookGit.changes.sortByExtensionChecked'], sortMode: 'extension' },
];

const CHANGES_NATIVE_COMMANDS: readonly ChangesCommandDescriptor[] = [
    ...REPOSITORY_TOOLBAR_COMMANDS.map((command) => toolbarDescriptor(ChangesCommandScope.ActiveRepository, command)),
    descriptor(ChangesCommandScope.ActiveRepository, 'stageAllChanges', ChangesCommandKind.StageAll),
    descriptor(ChangesCommandScope.ActiveRepository, 'unstageAllChanges', ChangesCommandKind.UnstageAll),
    descriptor(ChangesCommandScope.ActiveRepository, 'discardAllChanges', ChangesCommandKind.DiscardAll),
    descriptor(ChangesCommandScope.ActiveRepository, 'commit', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.ActiveRepository, 'commitStaged', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.ActiveRepository, 'commitAll', ChangesCommandKind.StageAllThenFocusCommit),
    descriptor(ChangesCommandScope.ActiveRepository, 'commitAmend', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.ActiveRepository, 'commitStagedAmend', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.ActiveRepository, 'commitAllAmend', ChangesCommandKind.StageAllThenFocusCommit),
    ...SUBMODULE_TOOLBAR_COMMANDS.map((command) => toolbarDescriptor(ChangesCommandScope.Submodule, command)),
    descriptor(ChangesCommandScope.Submodule, 'commit', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'commitStaged', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'commitAll', ChangesCommandKind.StageAllThenFocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'commitAmend', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'commitStagedAmend', ChangesCommandKind.FocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'commitAllAmend', ChangesCommandKind.StageAllThenFocusCommit),
    descriptor(ChangesCommandScope.Submodule, 'stageAllChanges', ChangesCommandKind.StageAll),
    descriptor(ChangesCommandScope.Submodule, 'unstageAllChanges', ChangesCommandKind.UnstageAll),
    descriptor(ChangesCommandScope.Submodule, 'discardAllChanges', ChangesCommandKind.DiscardAll),
];

const CHANGES_COMMIT_COMPOSER_NATIVE_COMMANDS: readonly ChangesCommitComposerCommandDescriptor[] = [
    { id: 'lookGit.changes.commitComposer.amend', mode: CommitMode.Amend },
    { id: 'lookGit.changes.commitComposer.commitPush', mode: CommitMode.CommitPush },
    { id: 'lookGit.changes.commitComposer.commitSync', mode: CommitMode.CommitSync },
];

function toolbarDescriptor(scope: ChangesCommandScope, toolbarCommand: ChangesToolbarCommand): ChangesCommandDescriptor {
    return {
        id: commandId(scope, toolbarCommand),
        scope,
        kind: ChangesCommandKind.Toolbar,
        toolbarCommand,
    };
}

function descriptor(scope: ChangesCommandScope, actionId: string, kind: ChangesCommandKind): ChangesCommandDescriptor {
    return {
        id: commandId(scope, actionId),
        scope,
        kind,
        toolbarCommand: undefined,
    };
}

function commandId(scope: ChangesCommandScope, actionId: string): string {
    const prefix = scope === ChangesCommandScope.Submodule ? 'lookGit.changes.submodule' : 'lookGit.changes';
    return `${prefix}.${actionId}`;
}

export class ChangesViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.changesView';

    private view?: vscode.WebviewView;
    private router?: ChangesMessageRouter;
    private pendingRefresh = false;
    private refreshPromise?: Promise<void>;
    private refreshAbortController?: AbortController;
    private refreshTimer?: ReturnType<typeof setTimeout>;
    private contextTarget?: ChangesContextTarget;
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
            if (msg.type === 'changes/contextTarget') {
                this.contextTarget = msg.target;
                return;
            }
            void this.router!.handle(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.pendingRefresh) {
                this.scheduleRefresh();
            }
        });

        void this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        void this.commands.executeCommand('setContext', 'lookGit.changesViewAsTree', this.viewAsTree);
        void this.commands.executeCommand('setContext', 'lookGit.changesViewMode', 'tree');
        void this.commands.executeCommand('setContext', 'lookGit.changesSortMode', 'path');
        this.scheduleRefresh();
    }

    // Injected to allow mocking in tests
    private get commands() { return vscode.commands; }

    registerNativeContextCommands(): readonly vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('lookGit.changes.refresh', () => this.refresh()),
            ...CHANGES_VIEW_COMMANDS.flatMap(({ ids, viewMode }) => ids.map((id) => vscode.commands.registerCommand(id, () => this.applyViewMode(viewMode)))),
            ...CHANGES_SORT_COMMANDS.flatMap(({ ids, sortMode }) => ids.map((id) => vscode.commands.registerCommand(id, () => this.applySortMode(sortMode)))),
            ...CHANGES_NATIVE_COMMANDS.map((command) => vscode.commands.registerCommand(command.id, () => this.runNativeCommand(command))),
            ...CHANGES_COMMIT_COMPOSER_NATIVE_COMMANDS.map((command) => vscode.commands.registerCommand(command.id, () => this.runCommitComposerNativeCommand(command))),
        ];
    }

    private async runCommitComposerNativeCommand(command: ChangesCommitComposerCommandDescriptor): Promise<void> {
        const target = this.contextTarget;
        if (!target || target.kind !== 'commitComposer') {
            await vscode.window.showWarningMessage('No commit message is selected for this command.');
            return;
        }
        if (target.submodulePath) {
            await this.router?.handle({
                type: 'changes/submoduleCommit',
                submodulePath: target.submodulePath,
                message: target.message,
                mode: command.mode,
            });
            return;
        }
        await this.router?.handle({
            type: 'changes/commit',
            message: target.message,
            mode: command.mode,
        });
    }

    private async runNativeCommand(command: ChangesCommandDescriptor): Promise<void> {
        const submodulePath = await this.submodulePathFor(command.scope);
        if (command.scope === ChangesCommandScope.Submodule && !submodulePath) { return; }

        switch (command.kind) {
            case ChangesCommandKind.Toolbar:
                if (!command.toolbarCommand) { return; }
                await this.runToolbarCommand(command.scope, command.toolbarCommand, submodulePath);
                return;
            case ChangesCommandKind.StageAll:
                await this.stageAll(command.scope, submodulePath);
                return;
            case ChangesCommandKind.UnstageAll:
                await this.unstageAll(command.scope, submodulePath);
                return;
            case ChangesCommandKind.DiscardAll:
                await this.discardAll(command.scope, submodulePath);
                return;
            case ChangesCommandKind.FocusCommit:
                this.focusCommit(command.scope, submodulePath);
                return;
            case ChangesCommandKind.StageAllThenFocusCommit:
                await this.stageAll(command.scope, submodulePath);
                this.focusCommit(command.scope, submodulePath);
                return;
        }
    }

    private async submodulePathFor(scope: ChangesCommandScope): Promise<string | undefined> {
        if (scope === ChangesCommandScope.ActiveRepository) { return undefined; }
        const target = this.contextTarget;
        if (!target || target.kind !== 'submoduleToolbar') {
            await vscode.window.showWarningMessage('No submodule is selected for this command.');
            return undefined;
        }
        return target.submodulePath;
    }

    private async runToolbarCommand(
        scope: ChangesCommandScope,
        command: ChangesToolbarCommand,
        submodulePath: string | undefined,
    ): Promise<void> {
        if (scope === ChangesCommandScope.ActiveRepository) {
            await this.router?.handleToolbarCommand(command);
            return;
        }
        if (!submodulePath) { return; }
        await this.router?.handle({ type: 'changes/submoduleToolbarCommand', submodulePath, command });
    }

    private async stageAll(scope: ChangesCommandScope, submodulePath: string | undefined): Promise<void> {
        if (scope === ChangesCommandScope.ActiveRepository) {
            await this.router?.handle({ type: 'changes/stageAll' });
            return;
        }
        if (!submodulePath) { return; }
        await this.router?.handle({ type: 'changes/submoduleStageAll', submodulePath });
    }

    private async unstageAll(scope: ChangesCommandScope, submodulePath: string | undefined): Promise<void> {
        if (scope === ChangesCommandScope.ActiveRepository) {
            await this.router?.handle({ type: 'changes/unstageAll' });
            return;
        }
        if (!submodulePath) { return; }
        await this.router?.handle({ type: 'changes/submoduleUnstageAll', submodulePath });
    }

    private async discardAll(scope: ChangesCommandScope, submodulePath: string | undefined): Promise<void> {
        if (scope === ChangesCommandScope.ActiveRepository) {
            await this.router?.handle({ type: 'changes/discardAll' });
            return;
        }
        if (!submodulePath) { return; }
        await this.router?.handle({ type: 'changes/submoduleDiscardAll', submodulePath });
    }

    private focusCommit(scope: ChangesCommandScope, submodulePath: string | undefined): void {
        if (scope === ChangesCommandScope.ActiveRepository) {
            this.focusCommitComposer();
            return;
        }
        if (!submodulePath) { return; }
        this.focusSubmoduleCommitComposer(submodulePath);
    }

    private async applyViewMode(viewMode: ChangesViewPreference): Promise<void> {
        this.viewAsTree = viewMode === 'tree';
        await this.commands.executeCommand('setContext', 'lookGit.viewAsTree', this.viewAsTree);
        await this.commands.executeCommand('setContext', 'lookGit.changesViewAsTree', this.viewAsTree);
        await this.commands.executeCommand('setContext', 'lookGit.changesViewMode', viewMode);
        this.view?.webview.postMessage({ type: 'changes/applyViewMode', viewMode });
    }

    private async applySortMode(sortMode: ChangesSortPreference): Promise<void> {
        await this.commands.executeCommand('setContext', 'lookGit.changesSortMode', sortMode);
        this.view?.webview.postMessage({ type: 'changes/applySortMode', sortMode });
    }

    private focusCommitComposer(): void {
        this.view?.webview.postMessage({ type: 'changes/focusCommitComposer' });
    }

    private focusSubmoduleCommitComposer(path: string): void {
        this.view?.webview.postMessage({ type: 'changes/focusSubmoduleCommitComposer', path });
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

                const { status, stashes, submodules, currentBranch } = await this.getChangesStatus.execute(repo, controller.signal);
                this.router?.setKnownSubmodulePaths(submodules.map((submodule) => submodule.path));
                this.updateBadge(status.staged.length + status.unstaged.length + status.conflicts.length);
                this.view.webview.postMessage(buildStatusData(status, stashes, submodules, currentBranch));
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
        this.contextTarget = undefined;
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
