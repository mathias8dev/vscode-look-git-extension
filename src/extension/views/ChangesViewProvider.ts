import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ChangesSortPreference, ChangesToolbarCommand, ChangesViewPreference, ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import { CommitMode, type ChangesContextTarget } from '../../protocol/changes/types';
import type { RepoContext } from '../../core/git/domain/RepoContext';
import { ChangesMessageRouter, buildStatusData, emptyStatusData } from '../messaging/ChangesMessageRouter';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { ScopedGitRepository } from '../git/scoped-git-repository';
import type { RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import type { GitRepository } from '../../application/ports/git-repository';
import { createErrorPayload, isAbortError } from '../messaging/errorSerialization';
import { getWebviewHtml } from './webviewHtml';
import { GetChangesStatusUseCase } from '../../application/usecases/changes/get-changes-status';
import { GenerateCommitMessageUseCase } from '../../application/usecases/changes/generate-commit-message';
import { CreateChangesPatchResultKind, type CreateChangesPatchResult, type CreateChangesPatchUseCase } from '../../application/usecases/changes/create-changes-patch';
import { ApplyPatchMode, ApplyPatchResultKind, ApplyPatchUseCase } from '../../application/usecases/changes/apply-patch';
import { VscodeLanguageModelCommitMessageGenerator } from '../adapters/vscode/vscode-language-model-commit-message-generator';
import { defaultCreateChangesPatch } from '../adapters/vscode/default-create-changes-patch';
import { toSerializedRepoContext } from '../mapping/toProtocol';
import { webviewFontSizeMessage } from './webview-font';

const APPLY_PATCH_FROM_CLIPBOARD = 'From Clipboard';
const APPLY_PATCH_FROM_FILE = 'From File...';
const APPLY_PATCH_TO_WORKING_TREE = 'Apply to Working Tree';
const APPLY_PATCH_AND_STAGE = 'Apply and Stage';

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

enum ChangesSelectionCommandKind {
    Stage,
    Unstage,
    Stash,
    CreatePatch,
    Discard,
}

interface ChangesSelectionCommandDescriptor {
    readonly id: string;
    readonly kind: ChangesSelectionCommandKind;
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

const REPOSITORY_TOOLBAR_COMMANDS: readonly ChangesToolbarCommand[] = ['openGraph', 'applyPatch', ...SHARED_TOOLBAR_COMMANDS];
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

const CHANGES_SELECTION_NATIVE_COMMANDS: readonly ChangesSelectionCommandDescriptor[] = [
    { id: 'lookGit.changes.selection.stage', kind: ChangesSelectionCommandKind.Stage },
    { id: 'lookGit.changes.selection.unstage', kind: ChangesSelectionCommandKind.Unstage },
    { id: 'lookGit.changes.selection.stash', kind: ChangesSelectionCommandKind.Stash },
    { id: 'lookGit.changes.selection.createPatch', kind: ChangesSelectionCommandKind.CreatePatch },
    { id: 'lookGit.changes.selection.discard', kind: ChangesSelectionCommandKind.Discard },
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
        private readonly createChangesPatch: CreateChangesPatchUseCase = defaultCreateChangesPatch,
        private readonly applyPatch = new ApplyPatchUseCase(),
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
            ...CHANGES_SELECTION_NATIVE_COMMANDS.map((command) => vscode.commands.registerCommand(command.id, () => this.runSelectionNativeCommand(command))),
        ];
    }

    private async runSelectionNativeCommand(command: ChangesSelectionCommandDescriptor): Promise<void> {
        const target = this.contextTarget;
        if (!target || target.kind !== 'selection') {
            await vscode.window.showWarningMessage('No changes are selected for this command.');
            return;
        }
        switch (command.kind) {
            case ChangesSelectionCommandKind.Stage:
                await this.runSelectionFileCommand(target.stageFilePaths, target.submodulePath
                    ? { type: 'changes/submoduleStageFiles', submodulePath: target.submodulePath, filePaths: target.stageFilePaths }
                    : { type: 'changes/stageFiles', filePaths: target.stageFilePaths });
                return;
            case ChangesSelectionCommandKind.Unstage:
                await this.runSelectionFileCommand(target.unstageFilePaths, target.submodulePath
                    ? { type: 'changes/submoduleUnstageFiles', submodulePath: target.submodulePath, filePaths: target.unstageFilePaths }
                    : { type: 'changes/unstageFiles', filePaths: target.unstageFilePaths });
                return;
            case ChangesSelectionCommandKind.Stash:
                await this.stashSelectedFiles(target.submodulePath, target.stashFilePaths, target.stashIncludeUntracked);
                return;
            case ChangesSelectionCommandKind.CreatePatch:
                await this.createPatchFromSelectedChanges(target);
                return;
            case ChangesSelectionCommandKind.Discard:
                await this.runSelectionFileCommand(target.discardFilePaths, target.submodulePath
                    ? { type: 'changes/submoduleDiscardFiles', submodulePath: target.submodulePath, filePaths: target.discardFilePaths }
                    : { type: 'changes/discardFiles', filePaths: target.discardFilePaths });
                return;
        }
    }

    private async createPatchFromSelectedChanges(target: Extract<ChangesContextTarget, { readonly kind: 'selection' }>): Promise<void> {
        const selectedCount = target.patchStagedFilePaths.length + target.patchUnstagedFilePaths.length + target.patchUntrackedFilePaths.length;
        if (selectedCount === 0) {
            await vscode.window.showWarningMessage('No selected changes can be exported as a patch.');
            return;
        }
        const baseRepo = this.repositories.requireRepository();
        const repo = target.submodulePath
            ? new ScopedGitRepository(baseRepo, await requireKnownSubmodulePath(baseRepo, target.submodulePath))
            : baseRepo;
        await showChangesPatchNotification(await this.createChangesPatch.execute(repo, {
            stagedFilePaths: target.patchStagedFilePaths,
            unstagedFilePaths: target.patchUnstagedFilePaths,
            untrackedFilePaths: target.patchUntrackedFilePaths,
        }));
    }

    private async runSelectionFileCommand(
        filePaths: readonly string[],
        message: ChangesWebviewToExtensionMessage,
    ): Promise<void> {
        if (filePaths.length === 0) {
            await vscode.window.showWarningMessage('No selected changes can use this command.');
            return;
        }
        await this.router?.handle(message);
    }

    private async stashSelectedFiles(
        submodulePath: string | undefined,
        filePaths: readonly string[],
        includeUntracked: boolean,
    ): Promise<void> {
        if (filePaths.length === 0) {
            await vscode.window.showWarningMessage('No selected changes can be stashed.');
            return;
        }
        const message = await vscode.window.showInputBox({
            prompt: 'Stash selected changes',
            placeHolder: 'Stash message (optional)',
        });
        if (message === undefined) { return; }
        const trimmedMessage = message.trim();
        if (submodulePath) {
            await this.router?.handle({
                type: 'changes/submoduleStashSelectedFiles',
                submodulePath,
                filePaths,
                includeUntracked,
                ...(trimmedMessage ? { message: trimmedMessage } : {}),
            });
            return;
        }
        await this.router?.handle({
            type: 'changes/stashSelectedFiles',
            filePaths,
            includeUntracked,
            ...(trimmedMessage ? { message: trimmedMessage } : {}),
        });
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
            if (command === 'applyPatch') {
                await this.applyPatchToRepository(this.repositories.requireRepository());
                return;
            }
            await this.router?.handleToolbarCommand(command);
            return;
        }
        if (!submodulePath) { return; }
        await this.router?.handle({ type: 'changes/submoduleToolbarCommand', submodulePath, command });
    }

    private async applyPatchToRepository(repo: GitRepository): Promise<void> {
        const patchContent = await pickPatchContent();
        if (patchContent === undefined) { return; }
        if (!patchContent.trim()) {
            await vscode.window.showWarningMessage('Patch content is empty.');
            return;
        }
        const mode = await pickApplyPatchMode();
        if (mode === undefined) { return; }
        const tempFile = await writeTempPatchFile(patchContent);
        try {
            try {
                await this.applyPatch.preflight(repo, tempFile, mode);
            } catch (error) {
                await showApplyPatchPreflightError(error);
                return;
            }
            const result = await this.applyPatch.execute(repo, tempFile, mode);
            await Promise.all([this.refresh(), this.onRepositoryUpdated()]);
            if (result.kind === ApplyPatchResultKind.AppliedWithConflicts) {
                await vscode.window.showWarningMessage('Patch applied with conflicts.');
                return;
            }
            await vscode.window.showInformationMessage(mode === ApplyPatchMode.Index ? 'Patch applied and staged.' : 'Patch applied.');
        } finally {
            await fs.rm(path.dirname(tempFile), { recursive: true, force: true });
        }
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

async function showChangesPatchNotification(result: CreateChangesPatchResult): Promise<void> {
    switch (result.kind) {
        case CreateChangesPatchResultKind.Cancelled:
            return;
        case CreateChangesPatchResultKind.CopiedToClipboard:
            await vscode.window.showInformationMessage('Patch copied to clipboard.');
            return;
        case CreateChangesPatchResultKind.SavedToFile:
            await vscode.window.showInformationMessage(`Patch saved to ${result.filePath ?? 'file'}.`);
            return;
    }
}

async function pickPatchContent(): Promise<string | undefined> {
    const source = await vscode.window.showQuickPick([APPLY_PATCH_FROM_CLIPBOARD, APPLY_PATCH_FROM_FILE], {
        placeHolder: 'Apply patch',
    });
    switch (source) {
        case APPLY_PATCH_FROM_CLIPBOARD:
            return vscode.env.clipboard.readText();
        case APPLY_PATCH_FROM_FILE:
            return readPatchFile();
        case undefined:
            return undefined;
    }
}

async function readPatchFile(): Promise<string | undefined> {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { Patches: ['patch', 'diff'] },
        openLabel: 'Apply Patch',
    });
    const uri = uris?.[0];
    if (!uri) { return undefined; }
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}

async function pickApplyPatchMode(): Promise<ApplyPatchMode | undefined> {
    const mode = await vscode.window.showQuickPick([APPLY_PATCH_TO_WORKING_TREE, APPLY_PATCH_AND_STAGE], {
        placeHolder: 'Apply patch mode',
    });
    switch (mode) {
        case APPLY_PATCH_TO_WORKING_TREE:
            return ApplyPatchMode.WorkingTree;
        case APPLY_PATCH_AND_STAGE:
            return ApplyPatchMode.Index;
        case undefined:
            return undefined;
    }
}

async function writeTempPatchFile(content: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-apply-patch-'));
    const filePath = path.join(dir, 'patch.diff');
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
}

async function showApplyPatchPreflightError(error: unknown): Promise<void> {
    const output = vscode.window.createOutputChannel('Look Git');
    output.clear();
    output.appendLine('Patch preflight failed.');
    output.appendLine('');
    output.appendLine(errorDetails(error));
    const action = await vscode.window.showErrorMessage('Patch could not be applied.', 'Show Output');
    if (action === 'Show Output') { output.show(); }
}

function errorDetails(error: unknown): string {
    const parts = [
        error instanceof Error ? error.message : String(error),
        stringProperty(error, 'stdout'),
        stringProperty(error, 'stderr'),
    ].filter((part): part is string => Boolean(part));
    return Array.from(new Set(parts)).join('\n\n');
}

function stringProperty(value: unknown, key: 'stdout' | 'stderr'): string | undefined {
    if (typeof value !== 'object' || value === null) { return undefined; }
    const property = Object.getOwnPropertyDescriptor(value, key)?.value;
    return typeof property === 'string' ? property : undefined;
}

async function requireKnownSubmodulePath(repo: { getSubmodulePaths(): Promise<ReadonlySet<string>> }, submodulePath: string): Promise<string> {
    const paths = await repo.getSubmodulePaths();
    if (!paths.has(submodulePath)) { throw new Error(`Unknown submodule: ${submodulePath}`); }
    return submodulePath;
}
