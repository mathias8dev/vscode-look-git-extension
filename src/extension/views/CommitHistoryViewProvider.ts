import * as vscode from 'vscode';
import * as path from 'path';
import type { GitBranch, GitCommit, GitFileChange, GitRepository, GitTag } from '../../application/ports/git-repository';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ErrorCode, Pagination, RequestId } from '../../protocol/shared/base';
import { OperationStatus } from '../../protocol/shared/operation';
import type { RepoContext } from '../../core/git/domain/RepoContext';
import type { CommitCommand } from '../../protocol/graph/messages';
import type { HistoryCommitDetails, HistoryCommitRef, HistoryContextTarget, HistoryData } from '../../protocol/history/types';
import type { HistoryCommitDetailsRequest, HistoryDataRequest, HistoryExtensionToWebviewMessage, HistoryOpenDiffRequest, HistoryOperationStatusPush, HistoryToolbarCommand, HistoryWebviewToExtensionMessage } from '../../protocol/history/messages';
import { runCommitCommand } from '../commands/commit-commands';
import { createErrorPayload } from '../messaging/errorSerialization';
import { appendErrorToOutput, showErrorOutput } from '../messaging/errorOutputChannel';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { getWebviewHtml } from './webviewHtml';
import { toSerializedRepoContext } from '../mapping/toProtocol';
import { webviewFontSizeMessage } from './webview-font';
import { operationActionsForStatus } from '../utils/operation-feedback';
import { ScopedGitRepository } from '../git/scoped-git-repository';
import type { GitSubmodule } from '../../core/git/domain/GitWorktree';
import { getReachableCommitHashes } from '../../application/usecases/commits/get-reachable-commit-hashes';
import { openCommitGitlinkDiff } from '../utils/gitlink-diff';
import { commitFileTempDiffUris } from '../utils/diff-uris';
import type { GitRepositoryResolver } from '../repositories/GitRepositoryResolver';

const DEFAULT_PAGE: Pagination = { offset: 0, limit: 50 };
const MAX_PAGE_LIMIT = 300;
const MAIN_REPOSITORY_SCOPE_LABEL = 'Main Repository';
const HISTORY_COMMIT_COMMANDS: readonly { readonly id: string; readonly command: CommitCommand }[] = [
    { id: 'lookGit.history.copyRevisionNumber', command: 'copyRevisionNumber' },
    { id: 'lookGit.history.createPatch', command: 'createPatch' },
    { id: 'lookGit.history.explainDiff', command: 'explainDiff' },
    { id: 'lookGit.history.cherryPick', command: 'cherryPick' },
    { id: 'lookGit.history.checkoutRevision', command: 'checkoutRevision' },
    { id: 'lookGit.history.showRepositoryAtRevision', command: 'showRepositoryAtRevision' },
    { id: 'lookGit.history.compareWithLocal', command: 'compareWithLocal' },
    { id: 'lookGit.history.newWorktreeFromCommit', command: 'newWorktreeFromCommit' },
    { id: 'lookGit.history.compareCommitWithWorktree', command: 'compareCommitWithWorktree' },
    { id: 'lookGit.history.resetCurrentBranchToHere', command: 'resetCurrentBranchToHere' },
    { id: 'lookGit.history.revertCommit', command: 'revertCommit' },
    { id: 'lookGit.history.undoCommit', command: 'undoCommit' },
    { id: 'lookGit.history.editCommitMessage', command: 'editCommitMessage' },
    { id: 'lookGit.history.fixup', command: 'fixup' },
    { id: 'lookGit.history.squashInto', command: 'squashInto' },
    { id: 'lookGit.history.dropCommit', command: 'dropCommit' },
    { id: 'lookGit.history.interactiveRebaseFromHere', command: 'interactiveRebaseFromHere' },
    { id: 'lookGit.history.pushAllUpToHere', command: 'pushAllUpToHere' },
    { id: 'lookGit.history.newBranch', command: 'newBranch' },
    { id: 'lookGit.history.newTag', command: 'newTag' },
];
const HISTORY_TITLE_COMMANDS: readonly { readonly id: string; readonly command: HistoryToolbarCommand }[] = [
    { id: 'lookGit.history.selectRepositoryScope', command: 'selectRepositoryScope' },
    { id: 'lookGit.history.selectBranch', command: 'selectBranch' },
    { id: 'lookGit.history.goToCurrent', command: 'goToCurrent' },
    { id: 'lookGit.history.fetchAll', command: 'fetchAll' },
    { id: 'lookGit.history.pull', command: 'pull' },
    { id: 'lookGit.history.push', command: 'push' },
];
const HISTORY_FILE_VIEW_COMMANDS: readonly { readonly id: string; readonly mode: 'list' | 'tree' }[] = [
    { id: 'lookGit.history.viewAsList', mode: 'list' },
    { id: 'lookGit.history.viewAsTree', mode: 'tree' },
];
const SHOW_FILE_HISTORY_COMMAND = 'lookGit.file.showHistory';

export class CommitHistoryViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.commitHistory';

    private view?: vscode.WebviewView;
    private contextTarget?: HistoryContextTarget;
    private contextRepository?: GitRepository;
    private selectedHistoryRef: string | undefined;
    private selectedRepositoryScope: HistoryRepositoryScope | undefined;
    private refCache?: HistoryRefCache;
    private operationSequence = 0;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
        private readonly repositoryResolver: GitRepositoryResolver = activeRepositoryOnlyResolver(repositories),
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        this.renderWebviewHtml(webviewView);

        webviewView.webview.onDidReceiveMessage((msg: HistoryWebviewToExtensionMessage) => {
            void this.handleMessage(msg);
        });

        void vscode.commands.executeCommand('setContext', 'lookGit.historyFileViewTree', true);
        void this.refresh();
    }

    registerNativeContextCommands(): readonly vscode.Disposable[] {
        return [
            ...HISTORY_COMMIT_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runCommitContextCommand(command))),
            ...HISTORY_TITLE_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, (uri?: vscode.Uri) => this.handleToolbarCommand(command, uri))),
            ...HISTORY_FILE_VIEW_COMMANDS.map(({ id, mode }) => vscode.commands.registerCommand(id, () => this.applyFileViewMode(mode))),
            vscode.commands.registerCommand(SHOW_FILE_HISTORY_COMMAND, (uri?: vscode.Uri) => this.showFileHistory(uri)),
            vscode.commands.registerCommand('lookGit.history.refresh', () => this.refresh()),
            vscode.commands.registerCommand('lookGit.history.goToChildCommit', () => this.selectContextCommit('child')),
            vscode.commands.registerCommand('lookGit.history.goToParentCommit', () => this.selectContextCommit('parent')),
            vscode.commands.registerCommand('lookGit.history.openFileDiff', () => this.openContextFileDiff()),
        ];
    }

    async refresh(): Promise<void> {
        if (!this.view) { return; }
        try {
            this.refCache = undefined;
            await this.syncSubmoduleScopeContext();
            const data = await this.loadHistoryPage(DEFAULT_PAGE);
            this.postMessage({ type: 'history/data', data });
        } catch (error) {
            this.postHistoryError(error, 'history/refresh', 'refreshFailed');
        }
    }

    private async handleMessage(message: HistoryWebviewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case 'history/ready':
            case 'history/refresh':
                await this.refresh();
                return;
            case 'history/dataRequest':
                await this.handleDataRequest(message);
                return;
            case 'history/commitDetailsRequest':
                await this.handleCommitDetailsRequest(message);
                return;
            case 'history/openDiff':
                await this.handleOpenDiff(message);
                return;
            case 'history/contextTarget':
                this.contextTarget = message.target;
                this.contextRepository = undefined;
                return;
            case 'history/toolbarCommand':
                await this.handleToolbarCommand(message.command);
                return;
            case 'history/showOutput':
                showErrorOutput();
                return;
        }
    }

    private async handleDataRequest(message: HistoryDataRequest): Promise<void> {
        if (!this.view) { return; }
        try {
            const data = await this.loadHistoryPage(message.page);
            this.postMessage({
                type: 'history/dataResponse',
                requestId: message.requestId,
                data,
            });
        } catch (error) {
            this.postHistoryError(error, 'history/dataRequest', 'refreshFailed', message.requestId);
        }
    }

    private async loadHistoryPage(page: Pagination): Promise<HistoryData> {
        const normalizedPage = normalizePage(page);
        const repo = this.currentHistoryRepository();
        if (!repo) {
            return {
                commits: [],
                page: normalizedPage,
                hasMore: false,
            };
        }

        return loadHistoryPageFor(repo, normalizedPage, {
            selectedHistoryRef: this.selectedHistoryRef,
            loadRefs: (historyRepo) => this.loadRefs(historyRepo),
        });
    }

    private async handleToolbarCommand(command: HistoryToolbarCommand, uri?: vscode.Uri): Promise<void> {
        switch (command) {
            case 'selectRepositoryScope':
                await this.selectRepositoryScope();
                return;
            case 'selectBranch':
                await this.selectHistoryBranch();
                return;
            case 'goToCurrent':
                await this.goToCurrentHistoryItem();
                return;
            case 'fetchAll':
                await this.runVscodeGitToolbarOperation('fetchAll', VscodeRemoteCommand.FetchAll, uri);
                return;
            case 'pull':
                await this.runVscodeGitToolbarOperation('pull', VscodeRemoteCommand.Pull, uri);
                return;
            case 'push':
                await this.runVscodeGitToolbarOperation('push', VscodeRemoteCommand.Push, uri);
                return;
        }
    }

    private async selectHistoryBranch(): Promise<void> {
        try {
            const repo = this.requireHistoryRepository();
            const branches = await repo.getAllBranches();
            const branchNames = branches.map((branch) => branch.name);
            const selected = await vscode.window.showQuickPick(['Current Branch', ...branchNames], {
                placeHolder: 'Select history branch',
            });
            if (!selected) { return; }
            this.selectedHistoryRef = selected === 'Current Branch' ? undefined : selected;
            await this.refresh();
        } catch (error) {
            this.postHistoryError(error, 'history/selectBranch', 'gitOperationFailed');
        }
    }

    private async goToCurrentHistoryItem(): Promise<void> {
        try {
            const repo = this.requireHistoryRepository();
            const hash = await repo.exec(['rev-parse', 'HEAD']);
            this.selectedHistoryRef = undefined;
            await this.refresh();
            this.postMessage({ type: 'history/selectCommit', hash });
        } catch (error) {
            this.postHistoryError(error, 'history/goToCurrent', 'gitOperationFailed');
        }
    }

    private async runVscodeGitToolbarOperation(operation: 'fetchAll' | 'pull' | 'push', command: VscodeRemoteCommand, uri?: vscode.Uri): Promise<void> {
        const operationId = this.nextOperationId();
        const nativeFileContext = uri !== undefined;
        try {
            const repo = uri ? await this.repositoryForFileContext(uri) : this.requireHistoryRepository();
            const existingConflicts = operation === 'pull' ? await conflictFileSet(repo) : undefined;
            if (!nativeFileContext) {
                this.postHistoryOperation({ operationId, status: OperationStatus.Running, command: operation });
            }
            await this.remoteCommands.runVscode(repo, command);
            await Promise.all([
                this.onRepositoryUpdated(),
                this.refresh(),
            ]);
            if (existingConflicts && await hasNewConflicts(repo, existingConflicts)) {
                if (nativeFileContext) {
                    await vscode.window.showWarningMessage(`${historyOperationLabel(operation)} stopped with conflicts.`);
                } else {
                    this.postHistoryOperation({ operationId, status: OperationStatus.Conflict, command: operation });
                }
                return;
            }
            if (!nativeFileContext) {
                this.postHistoryOperation({ operationId, status: OperationStatus.Success, command: operation });
            }
        } catch (error) {
            if (operation === 'pull') {
                try {
                    await Promise.all([this.onRepositoryUpdated(), this.refresh()]);
                    const repo = uri ? await this.repositoryForFileContext(uri) : this.requireHistoryRepository();
                    if (await hasAnyConflicts(repo)) {
                        if (nativeFileContext) {
                            await vscode.window.showWarningMessage('Pull stopped with conflicts.');
                        } else {
                            this.postHistoryOperation({ operationId, status: OperationStatus.Conflict, command: operation });
                        }
                        return;
                    }
                } catch {
                    await this.reportHistoryOperationFailure(error, operation, operationId, nativeFileContext);
                    return;
                }
            }
            await this.reportHistoryOperationFailure(error, operation, operationId, nativeFileContext);
        }
    }

    private async reportHistoryOperationFailure(error: unknown, operation: 'fetchAll' | 'pull' | 'push', operationId: string, nativeFileContext: boolean): Promise<void> {
        if (nativeFileContext) {
            const message = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(`${historyOperationLabel(operation)} failed: ${message}`);
            appendErrorToOutput(createErrorPayload(error, {
                code: 'gitOperationFailed',
                operation: `history/${operation}`,
                recoverable: true,
            }).error, 'history');
            return;
        }
        this.postHistoryOperation({ operationId, status: OperationStatus.Failed, command: operation });
        this.postHistoryError(error, `history/${operation}`, 'gitOperationFailed');
    }

    private async loadRefs(repo: GitRepository): Promise<HistoryRefCache> {
        if (this.refCache) { return this.refCache; }
        const [branches, tags] = await Promise.all([
            repo.getAllBranches(),
            repo.getAllTags(),
        ]);
        this.refCache = { branches, tags };
        return this.refCache;
    }

    private applyFileViewMode(mode: 'list' | 'tree'): void {
        void vscode.commands.executeCommand('setContext', 'lookGit.historyFileViewTree', mode === 'tree');
        this.postMessage({ type: 'history/applyFileViewMode', mode });
    }

    private async handleCommitDetailsRequest(message: HistoryCommitDetailsRequest): Promise<void> {
        if (!this.view) { return; }
        try {
            const details = await this.loadCommitDetails(message.hash);
            this.postMessage({
                type: 'history/commitDetailsResponse',
                requestId: message.requestId,
                details,
            });
        } catch (error) {
            this.postHistoryError(error, 'history/commitDetails', 'refreshFailed', message.requestId);
        }
    }

    private async loadCommitDetails(hash: string): Promise<HistoryCommitDetails> {
        const repo = this.currentHistoryRepository();
        if (!repo) { throw new Error('No active Git repository.'); }
        return loadCommitDetails(repo, hash);
    }

    private async handleOpenDiff(message: HistoryOpenDiffRequest): Promise<void> {
        try {
            await openHistoryDiff(this.requireHistoryRepository(), message);
        } catch (error) {
            this.postHistoryError(error, 'history/openDiff', 'vscodeCommandFailed');
        }
    }

    async showFileHistory(uri?: vscode.Uri): Promise<void> {
        try {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!targetUri) { throw new Error('No file is selected.'); }
            if (targetUri.scheme !== 'file') { throw new Error('File history is only available for local files.'); }

            const repo = await this.repositoryForFileContext(targetUri);
            const relativePath = repoRelativePath(repo.cwd, targetUri.fsPath);
            await this.openFileHistoryPanel(repo, relativePath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(message);
            this.postHistoryError(error, 'history/showFileHistory', 'validationFailed');
        }
    }

    private async openFileHistoryPanel(repo: GitRepository, pathFilter: string): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'lookGit.fileHistory',
            `Look Git History: ${path.basename(pathFilter)}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
            },
        );
        new FileHistoryPanelController(
            panel,
            this.extensionUri,
            repo,
            pathFilter,
            (target) => {
                this.contextTarget = target;
                this.contextRepository = repo;
            },
        );
        await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    }

    async runCommitContextCommand(command: CommitCommand): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'commit') {
            this.postHistoryError(new Error('No history commit is selected for this command.'), 'history/contextCommand', 'validationFailed');
            return;
        }
        if (command === 'squashInto' && target.hashes.length < 2) {
            this.postHistoryError(new Error('Select at least two commits to squash.'), 'history/squashInto', 'validationFailed');
            return;
        }
        if (command === 'cherryPick' && target.canCherryPick === false) {
            this.postHistoryError(
                new Error('Cherry-pick is unavailable because the selected commit already exists in the current branch history.'),
                'history/cherryPick',
                'validationFailed',
            );
            return;
        }

        try {
            const repo = this.contextRepository ?? this.requireHistoryRepository();
            const shouldRefresh = await runCommitCommand(
                repo,
                command,
                target.hash,
                target.hashes,
                this.remoteCommands,
                undefined,
                undefined,
                undefined,
                this.contextRepository ? undefined : this.selectedRepositoryScope ? { label: 'Submodule', value: this.selectedRepositoryScope.path } : undefined,
                this.extensionUri,
            );
            if (shouldRefresh) { await this.refresh(); }
        } catch (error) {
            this.postHistoryError(error, `history/${command}`, 'gitOperationFailed');
        }
    }

    private selectContextCommit(direction: 'child' | 'parent'): void {
        const target = this.contextTarget;
        if (target?.kind !== 'commit') {
            this.postHistoryError(new Error('No history commit is selected for this command.'), 'history/selectCommit', 'validationFailed');
            return;
        }

        const hash = direction === 'child' ? target.childHash : target.parentHash;
        if (!hash) {
            this.postHistoryError(new Error(`No ${direction} commit is available.`), 'history/selectCommit', 'validationFailed');
            return;
        }

        this.postMessage({ type: 'history/selectCommit', hash });
    }

    private async openContextFileDiff(): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'file') {
            this.postHistoryError(new Error('No history file is selected for this command.'), 'history/openFileDiff', 'validationFailed');
            return;
        }
        const message = {
            type: 'history/openDiff',
            commitHash: target.commitHash,
            filePath: target.file.filePath,
            status: target.file.status,
            origPath: target.file.origPath,
            parentHash: target.file.parentHash,
            isSubmodule: target.file.isSubmodule,
        } satisfies HistoryOpenDiffRequest;
        try {
            await openHistoryDiff(this.contextRepository ?? this.requireHistoryRepository(), message);
        } catch (error) {
            this.postHistoryError(error, 'history/openFileDiff', 'vscodeCommandFailed');
        }
    }

    private postHistoryError(error: unknown, operation: string, code: ErrorCode, requestId?: RequestId): void {
        const payload = createErrorPayload(error, {
            code,
            operation,
            recoverable: true,
        });
        appendErrorToOutput(payload.error, 'history');
        this.postMessage({
            type: 'history/error',
            ...(requestId !== undefined ? { requestId } : {}),
            ...payload,
        });
    }

    private postHistoryOperation(operation: Omit<HistoryOperationStatusPush, 'type'>): void {
        this.postMessage({
            type: 'history/operationStatus',
            ...operation,
            actions: operation.actions ?? operationActionsForStatus(operation.status),
        });
    }

    private nextOperationId(): string {
        this.operationSequence += 1;
        return `history-op-${this.operationSequence}`;
    }

    async notifyRepoChanged(context: RepoContext): Promise<void> {
        this.selectedHistoryRef = undefined;
        this.selectedRepositoryScope = undefined;
        this.contextRepository = undefined;
        this.refCache = undefined;
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context: toSerializedRepoContext(context) });
        await this.refresh();
    }

    notifyFontSizeChanged(): void {
        this.postMessage(webviewFontSizeMessage());
    }

    private postMessage(message: HistoryExtensionToWebviewMessage): void {
        void this.view?.webview.postMessage(message);
    }

    private renderWebviewHtml(webviewView: vscode.WebviewView): void {
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'history');
    }

    private currentHistoryRepository(): GitRepository | undefined {
        const repo = this.repositories.currentRepository;
        if (!repo) { return undefined; }
        return this.repositoryForHistoryScope(repo);
    }

    private requireHistoryRepository(): GitRepository {
        return this.repositoryForHistoryScope(this.repositories.requireRepository());
    }

    private async repositoryForFileContext(uri: vscode.Uri): Promise<GitRepository> {
        if (uri.scheme !== 'file') {
            throw new Error('Look Git file actions are only available for local files.');
        }

        return this.repositoryResolver.repositoryForUri(uri);
    }

    private repositoryForHistoryScope(repo: GitRepository): GitRepository {
        return this.selectedRepositoryScope
            ? new ScopedGitRepository(repo, this.selectedRepositoryScope.path)
            : repo;
    }

    private async selectRepositoryScope(): Promise<void> {
        try {
            const repo = this.repositories.requireRepository();
            const submodules = await this.loadSubmodules(repo);
            await this.applySubmoduleScopeContext(submodules);
            if (submodules.length === 0) {
                await vscode.window.showInformationMessage('No submodules found in this repository.');
                return;
            }

            const options = [
                MAIN_REPOSITORY_SCOPE_LABEL,
                ...submodules.map((submodule) => submoduleScopeOption(submodule.path)),
            ];
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select repository for commit history actions',
            });
            if (!selected) { return; }

            this.selectedRepositoryScope = selected === MAIN_REPOSITORY_SCOPE_LABEL
                ? undefined
                : { path: submodulePathFromOption(selected) };
            this.selectedHistoryRef = undefined;
            this.contextTarget = undefined;
            this.contextRepository = undefined;
            this.refCache = undefined;
            await this.refresh();
        } catch (error) {
            this.postHistoryError(error, 'history/selectRepositoryScope', 'gitOperationFailed');
        }
    }

    private async syncSubmoduleScopeContext(): Promise<void> {
        const repo = this.repositories.currentRepository;
        if (!repo) {
            this.selectedRepositoryScope = undefined;
            await vscode.commands.executeCommand('setContext', 'lookGit.historyHasSubmodules', false);
            return;
        }
        const submodules = await this.loadSubmodules(repo);
        await this.applySubmoduleScopeContext(submodules);
    }

    private async applySubmoduleScopeContext(submodules: readonly GitSubmodule[]): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'lookGit.historyHasSubmodules', submodules.length > 0);
        if (!this.selectedRepositoryScope) { return; }
        if (submodules.some((submodule) => submodule.path === this.selectedRepositoryScope?.path)) { return; }
        this.selectedRepositoryScope = undefined;
        this.selectedHistoryRef = undefined;
        this.contextTarget = undefined;
        this.contextRepository = undefined;
        this.refCache = undefined;
    }

    private async loadSubmodules(repo: GitRepository): Promise<readonly GitSubmodule[]> {
        try { return await repo.getSubmoduleStatus(); }
        catch (error) {
            this.postHistoryError(error, 'history/listSubmodules', 'gitOperationFailed');
            return [];
        }
    }
}

interface HistoryRefCache {
    readonly branches: readonly GitBranch[];
    readonly tags: readonly GitTag[];
}

interface LoadHistoryPageOptions {
    readonly selectedHistoryRef?: string;
    readonly pathFilter?: string;
    readonly loadRefs: (repo: GitRepository) => Promise<HistoryRefCache>;
}

interface HistoryRepositoryScope {
    readonly path: string;
}

class FileHistoryPanelController {
    private refCache?: HistoryRefCache;

    constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly repo: GitRepository,
        private readonly pathFilter: string,
        private readonly onContextTarget: (target: HistoryContextTarget) => void,
    ) {
        this.panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri, 'fileHistory');
        this.panel.webview.onDidReceiveMessage((message: HistoryWebviewToExtensionMessage) => {
            void this.handleMessage(message);
        });
    }

    private async handleMessage(message: HistoryWebviewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case 'history/ready':
            case 'history/refresh':
                await this.refresh();
                return;
            case 'history/dataRequest':
                await this.handleDataRequest(message);
                return;
            case 'history/commitDetailsRequest':
                await this.handleCommitDetailsRequest(message);
                return;
            case 'history/openDiff':
                await this.handleOpenDiff(message);
                return;
            case 'history/contextTarget':
                this.onContextTarget(message.target);
                return;
            case 'history/showOutput':
                showErrorOutput();
                return;
            case 'history/toolbarCommand':
                return;
        }
    }

    private async refresh(): Promise<void> {
        try {
            this.refCache = undefined;
            const data = await this.loadHistoryPage(DEFAULT_PAGE);
            this.postMessage({ type: 'history/data', data });
        } catch (error) {
            this.postHistoryError(error, 'history/refresh', 'refreshFailed');
        }
    }

    private async handleDataRequest(message: HistoryDataRequest): Promise<void> {
        try {
            const data = await this.loadHistoryPage(message.page);
            this.postMessage({ type: 'history/dataResponse', requestId: message.requestId, data });
        } catch (error) {
            this.postHistoryError(error, 'history/dataRequest', 'refreshFailed', message.requestId);
        }
    }

    private loadHistoryPage(page: Pagination): Promise<HistoryData> {
        return loadHistoryPageFor(this.repo, normalizePage(page), {
            pathFilter: this.pathFilter,
            loadRefs: (repo) => this.loadRefs(repo),
        });
    }

    private async loadRefs(repo: GitRepository): Promise<HistoryRefCache> {
        if (this.refCache) { return this.refCache; }
        const [branches, tags] = await Promise.all([
            repo.getAllBranches(),
            repo.getAllTags(),
        ]);
        this.refCache = { branches, tags };
        return this.refCache;
    }

    private async handleCommitDetailsRequest(message: HistoryCommitDetailsRequest): Promise<void> {
        try {
            const details = await loadCommitDetails(this.repo, message.hash);
            this.postMessage({
                type: 'history/commitDetailsResponse',
                requestId: message.requestId,
                details,
            });
        } catch (error) {
            this.postHistoryError(error, 'history/commitDetails', 'refreshFailed', message.requestId);
        }
    }

    private async handleOpenDiff(message: HistoryOpenDiffRequest): Promise<void> {
        try {
            await openHistoryDiff(this.repo, message);
        } catch (error) {
            this.postHistoryError(error, 'history/openDiff', 'vscodeCommandFailed');
        }
    }

    private postMessage(message: HistoryExtensionToWebviewMessage): void {
        void this.panel.webview.postMessage(message);
    }

    private postHistoryError(error: unknown, operation: string, code: ErrorCode, requestId?: RequestId): void {
        const payload = createErrorPayload(error, {
            code,
            operation,
            recoverable: true,
        });
        appendErrorToOutput(payload.error, 'history');
        this.postMessage({
            type: 'history/error',
            ...(requestId !== undefined ? { requestId } : {}),
            ...payload,
        });
    }
}

function normalizePage(page: Pagination): Pagination {
    const offset = Number.isFinite(page.offset) ? Math.max(0, Math.floor(page.offset)) : 0;
    const limit = Number.isFinite(page.limit) ? Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(page.limit))) : DEFAULT_PAGE.limit;
    return { offset, limit };
}

async function loadHistoryPageFor(
    repo: GitRepository,
    page: Pagination,
    options: LoadHistoryPageOptions,
): Promise<HistoryData> {
    const pageLimit = page.limit + 1;
    const [commits, refs] = await Promise.all([
        loadHistoryCommits(repo, pageLimit, page.offset, options.selectedHistoryRef, options.pathFilter),
        options.loadRefs(repo),
    ]);
    const visibleCommits = commits.slice(0, page.limit);
    const currentBranchCommits = options.selectedHistoryRef
        ? await currentBranchCommitHashSet(repo, visibleCommits)
        : new Set(visibleCommits.map((commit) => commit.hash));
    return {
        commits: visibleCommits.map((commit) => toHistoryCommit(
            commit,
            refsForCommit(commit, refs.branches, refs.tags),
            !currentBranchCommits.has(commit.hash),
        )),
        page,
        hasMore: commits.length > page.limit,
    };
}

function loadHistoryCommits(
    repo: GitRepository,
    limit: number,
    offset: number,
    selectedHistoryRef: string | undefined,
    pathFilter: string | undefined,
): Promise<readonly GitCommit[]> {
    if (selectedHistoryRef && pathFilter) {
        return repo.getLogForRefAndPath(selectedHistoryRef, pathFilter, limit, offset);
    }
    if (selectedHistoryRef) {
        return repo.getLogForRef(selectedHistoryRef, limit, offset);
    }
    if (pathFilter) {
        return repo.getLogForPath(pathFilter, limit, offset);
    }
    return repo.getLog(limit, offset);
}

async function loadCommitDetails(repo: GitRepository, hash: string): Promise<HistoryCommitDetails> {
    const [fullMessage, files] = await Promise.all([
        repo.getCommitMessage(hash),
        repo.getCommitFiles(hash),
    ]);
    return {
        hash,
        fullMessage,
        files: files.map(toHistoryCommitFile),
    };
}

async function openHistoryDiff(repo: GitRepository, message: HistoryOpenDiffRequest): Promise<void> {
    if (message.isSubmodule) {
        await openCommitGitlinkDiff(repo, message);
        return;
    }
    const { left, right } = await commitFileTempDiffUris(repo, repo.cwd, message);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(message.filePath)} (${message.commitHash.substring(0, 7)})`);
}

function toHistoryCommit(commit: GitCommit, refs: readonly HistoryCommitRef[], canCherryPick: boolean) {
    return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        message: commit.message,
        authorName: commit.authorName,
        authorDate: commit.authorDate,
        parentHashes: commit.parentHashes,
        refs,
        canCherryPick,
    };
}

function refsForCommit(
    commit: GitCommit,
    branches: readonly GitBranch[],
    tags: readonly GitTag[],
): readonly HistoryCommitRef[] {
    const refs: HistoryCommitRef[] = [];
    for (const branch of branches) {
        if (!refPointsAtCommit(branch.hash, commit)) { continue; }
        refs.push({
            name: branch.name,
            kind: branch.isRemote ? 'remote' : 'local',
            ...(branch.isCurrent ? { isCurrent: true } : {}),
        });
    }
    for (const tag of tags) {
        if (!refPointsAtCommit(tag.hash, commit)) { continue; }
        refs.push({ name: tag.name, kind: 'tag' });
    }
    return refs.sort(compareHistoryRefs);
}

function refPointsAtCommit(refHash: string, commit: GitCommit): boolean {
    if (!refHash) { return false; }
    return commit.hash === refHash
        || commit.shortHash === refHash
        || commit.hash.startsWith(refHash)
        || refHash.startsWith(commit.hash);
}

function compareHistoryRefs(left: HistoryCommitRef, right: HistoryCommitRef): number {
    return refSortRank(left) - refSortRank(right) || left.name.localeCompare(right.name);
}

function refSortRank(ref: HistoryCommitRef): number {
    if (ref.kind === 'local' && ref.isCurrent) { return 0; }
    if (ref.kind === 'local') { return 1; }
    if (ref.kind === 'remote') { return 2; }
    return 3;
}

function toHistoryCommitFile(file: GitFileChange) {
    return {
        status: file.status,
        filePath: file.filePath,
        origPath: file.origPath,
        parentHash: file.parentHash,
        isSubmodule: file.isSubmodule,
    };
}

function submoduleScopeOption(submodulePath: string): string {
    return `Submodule: ${submodulePath}`;
}

function submodulePathFromOption(option: string): string {
    return option.replace(/^Submodule: /, '');
}

function repoRelativePath(repoCwd: string, filePath: string): string {
    const relative = path.relative(repoCwd, filePath);
    if (!relative || relative === '..' || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) {
        throw new Error('Selected file is outside the active repository.');
    }
    return relative.split(path.sep).join('/');
}

function historyOperationLabel(operation: 'fetchAll' | 'pull' | 'push'): string {
    switch (operation) {
        case 'fetchAll':
            return 'Fetch';
        case 'pull':
            return 'Pull';
        case 'push':
            return 'Push';
    }
}

function activeRepositoryOnlyResolver(repositories: ActiveRepositoryAccessor): GitRepositoryResolver {
    return {
        async repositoryForUri() {
            return repositories.requireRepository();
        },
    };
}

async function conflictFileSet(repo: GitRepository): Promise<ReadonlySet<string>> {
    try {
        const status = await repo.getStatus();
        return new Set(status.conflicts.map((entry) => entry.filePath));
    } catch {
        return new Set();
    }
}

async function hasAnyConflicts(repo: GitRepository): Promise<boolean> {
    const status = await repo.getStatus();
    return status.conflicts.length > 0;
}

async function hasNewConflicts(repo: GitRepository, existingConflicts: ReadonlySet<string>): Promise<boolean> {
    const status = await repo.getStatus();
    return status.conflicts.some((entry) => !existingConflicts.has(entry.filePath));
}

async function currentBranchCommitHashSet(repo: GitRepository, commits: readonly GitCommit[]): Promise<ReadonlySet<string>> {
    try {
        return await getReachableCommitHashes(repo, commits.map((commit) => commit.hash));
    } catch {
        return new Set();
    }
}
