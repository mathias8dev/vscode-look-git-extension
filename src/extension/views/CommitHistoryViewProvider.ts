import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { GitBranch, GitCommit, GitFileChange, GitRepository, GitTag } from '../../application/ports/git-repository';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { ErrorCode, Pagination } from '../../protocol/shared/base';
import type { RepoContext } from '../../core/git/domain/RepoContext';
import type { CommitCommand } from '../../protocol/graph/messages';
import type { HistoryCommitDetails, HistoryCommitRef, HistoryContextTarget, HistoryData } from '../../protocol/history/types';
import type { HistoryCommitDetailsRequest, HistoryDataRequest, HistoryExtensionToWebviewMessage, HistoryOpenDiffRequest, HistoryToolbarCommand, HistoryWebviewToExtensionMessage } from '../../protocol/history/messages';
import { runCommitCommand } from '../commands/commit-commands';
import { createErrorPayload } from '../messaging/errorSerialization';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { getWebviewHtml } from './webviewHtml';
import { toSerializedRepoContext } from '../mapping/toProtocol';

const DEFAULT_PAGE: Pagination = { offset: 0, limit: 50 };
const MAX_PAGE_LIMIT = 300;
const HISTORY_COMMIT_COMMANDS: readonly { readonly id: string; readonly command: CommitCommand }[] = [
    { id: 'lookGit.history.copyRevisionNumber', command: 'copyRevisionNumber' },
    { id: 'lookGit.history.createPatch', command: 'createPatch' },
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

export class CommitHistoryViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.commitHistory';

    private view?: vscode.WebviewView;
    private contextTarget?: HistoryContextTarget;
    private selectedHistoryRef: string | undefined;
    private refCache?: HistoryRefCache;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'history');

        webviewView.webview.onDidReceiveMessage((msg: HistoryWebviewToExtensionMessage) => {
            void this.handleMessage(msg);
        });

        void vscode.commands.executeCommand('setContext', 'lookGit.historyFileViewTree', true);
        void this.refresh();
    }

    registerNativeContextCommands(): readonly vscode.Disposable[] {
        return [
            ...HISTORY_COMMIT_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runCommitContextCommand(command))),
            ...HISTORY_TITLE_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.handleToolbarCommand(command))),
            ...HISTORY_FILE_VIEW_COMMANDS.map(({ id, mode }) => vscode.commands.registerCommand(id, () => this.applyFileViewMode(mode))),
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
            const data = await this.loadHistoryPage(DEFAULT_PAGE);
            this.postMessage({ type: 'history/data', data });
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
                return;
            case 'history/toolbarCommand':
                await this.handleToolbarCommand(message.command);
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
            this.postMessage({
                type: 'history/error',
                requestId: message.requestId,
                ...createErrorPayload(error, {
                    code: 'refreshFailed',
                    operation: 'history/dataRequest',
                    recoverable: true,
                }),
            });
        }
    }

    private async loadHistoryPage(page: Pagination): Promise<HistoryData> {
        const normalizedPage = normalizePage(page);
        const repo = this.repositories.currentRepository;
        if (!repo) {
            return {
                commits: [],
                page: normalizedPage,
                hasMore: false,
            };
        }

        const [commits, refs] = await Promise.all([
            this.selectedHistoryRef
                ? repo.getLogForRef(this.selectedHistoryRef, normalizedPage.limit + 1, normalizedPage.offset)
                : repo.getLog(normalizedPage.limit + 1, normalizedPage.offset),
            this.loadRefs(repo),
        ]);
        return {
            commits: commits.slice(0, normalizedPage.limit).map((commit) => toHistoryCommit(commit, refsForCommit(commit, refs.branches, refs.tags))),
            page: normalizedPage,
            hasMore: commits.length > normalizedPage.limit,
        };
    }

    private async handleToolbarCommand(command: HistoryToolbarCommand): Promise<void> {
        switch (command) {
            case 'selectBranch':
                await this.selectHistoryBranch();
                return;
            case 'goToCurrent':
                await this.goToCurrentHistoryItem();
                return;
            case 'fetchAll':
                await this.runVscodeGitToolbarOperation('fetchAll', VscodeRemoteCommand.FetchAll);
                return;
            case 'pull':
                await this.runVscodeGitToolbarOperation('pull', VscodeRemoteCommand.Pull);
                return;
            case 'push':
                await this.runVscodeGitToolbarOperation('push', VscodeRemoteCommand.Push);
                return;
        }
    }

    private async selectHistoryBranch(): Promise<void> {
        try {
            const repo = this.repositories.requireRepository();
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
            const repo = this.repositories.requireRepository();
            const hash = await repo.exec(['rev-parse', 'HEAD']);
            this.selectedHistoryRef = undefined;
            await this.refresh();
            this.postMessage({ type: 'history/selectCommit', hash });
        } catch (error) {
            this.postHistoryError(error, 'history/goToCurrent', 'gitOperationFailed');
        }
    }

    private async runVscodeGitToolbarOperation(operation: 'fetchAll' | 'pull' | 'push', command: VscodeRemoteCommand): Promise<void> {
        try {
            const repo = this.repositories.requireRepository();
            await this.remoteCommands.runVscode(repo, command);
            await Promise.all([
                this.onRepositoryUpdated(),
                this.refresh(),
            ]);
        } catch (error) {
            this.postHistoryError(error, `history/${operation}`, 'gitOperationFailed');
        }
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
            this.postMessage({
                type: 'history/error',
                requestId: message.requestId,
                ...createErrorPayload(error, {
                    code: 'refreshFailed',
                    operation: 'history/commitDetails',
                    recoverable: true,
                }),
            });
        }
    }

    private async loadCommitDetails(hash: string): Promise<HistoryCommitDetails> {
        const repo = this.repositories.currentRepository;
        if (!repo) { throw new Error('No active Git repository.'); }

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

    private async handleOpenDiff(message: HistoryOpenDiffRequest): Promise<void> {
        try {
            const repo = this.repositories.requireRepository();
            const { left, right } = await createDiffUris(repo.cwd, message);
            await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(message.filePath)} (${message.commitHash.substring(0, 7)})`);
        } catch (error) {
            this.postMessage({
                type: 'history/error',
                ...createErrorPayload(error, {
                    code: 'vscodeCommandFailed',
                    operation: 'history/openDiff',
                    recoverable: true,
                }),
            });
        }
    }

    private async runCommitContextCommand(command: CommitCommand): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'commit') {
            this.postHistoryError(new Error('No history commit is selected for this command.'), 'history/contextCommand', 'validationFailed');
            return;
        }

        try {
            const repo = this.repositories.requireRepository();
            const shouldRefresh = await runCommitCommand(repo, command, target.hash, target.hashes, this.remoteCommands);
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
        if (target.file.isSubmodule) {
            this.postHistoryError(new Error('Submodule diffs are not available from commit history.'), 'history/openFileDiff', 'validationFailed');
            return;
        }

        await this.handleOpenDiff({
            type: 'history/openDiff',
            commitHash: target.commitHash,
            filePath: target.file.filePath,
            status: target.file.status,
            origPath: target.file.origPath,
            parentHash: target.file.parentHash,
        });
    }

    private postHistoryError(error: unknown, operation: string, code: ErrorCode): void {
        this.postMessage({
            type: 'history/error',
            ...createErrorPayload(error, {
                code,
                operation,
                recoverable: true,
            }),
        });
    }

    async notifyRepoChanged(context: RepoContext): Promise<void> {
        this.selectedHistoryRef = undefined;
        this.refCache = undefined;
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context: toSerializedRepoContext(context) });
        await this.refresh();
    }

    private postMessage(message: HistoryExtensionToWebviewMessage): void {
        void this.view?.webview.postMessage(message);
    }
}

interface HistoryRefCache {
    readonly branches: readonly GitBranch[];
    readonly tags: readonly GitTag[];
}

function normalizePage(page: Pagination): Pagination {
    const offset = Number.isFinite(page.offset) ? Math.max(0, Math.floor(page.offset)) : 0;
    const limit = Number.isFinite(page.limit) ? Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(page.limit))) : DEFAULT_PAGE.limit;
    return { offset, limit };
}

function toHistoryCommit(commit: GitCommit, refs: readonly HistoryCommitRef[]) {
    return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        message: commit.message,
        authorName: commit.authorName,
        authorDate: commit.authorDate,
        parentHashes: commit.parentHashes,
        refs,
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

async function createDiffUris(cwd: string, message: HistoryOpenDiffRequest): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const fileUri = vscode.Uri.file(path.join(cwd, message.filePath));
    const origUri = message.origPath ? vscode.Uri.file(path.join(cwd, message.origPath)) : fileUri;
    const parentRef = message.parentHash ?? `${message.commitHash}~1`;
    const status = message.status.charAt(0);

    if (status === 'A') {
        return {
            left: await emptyDiffUri(message.commitHash, message.filePath, 'parent'),
            right: toGitUri(fileUri, message.commitHash),
        };
    }

    if (status === 'D') {
        return {
            left: toGitUri(origUri, parentRef),
            right: await emptyDiffUri(message.commitHash, message.filePath, 'commit'),
        };
    }

    return {
        left: toGitUri(origUri, parentRef),
        right: toGitUri(fileUri, message.commitHash),
    };
}

async function emptyDiffUri(commitHash: string, filePath: string, side: string): Promise<vscode.Uri> {
    const dir = path.join(os.tmpdir(), 'look-git-empty-diffs');
    const fileName = `${commitHash.substring(0, 12)}-${side}-${Buffer.from(filePath).toString('base64url')}`;
    const emptyPath = path.join(dir, fileName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(emptyPath, '');
    return vscode.Uri.file(emptyPath);
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.path, ref }) });
}
