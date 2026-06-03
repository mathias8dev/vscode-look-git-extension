import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { CommitCommand, GraphRepositoryCommand, GraphWebviewToExtensionMessage, GraphExtensionToWebviewMessage, GraphDataResponse, CommitDetailsResponse, WorktreeDetailsResponse, OpenDiffRequest, OpenWorktreeDiffRequest } from '../../protocol/graph/messages';
import type { GraphData, GraphFilters } from '../../protocol/graph/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { GitRepository } from '../../application/ports/git-repository';
import { GetGraphDataUseCase, type GraphDataResult } from '../../application/usecases/graph/get-graph-data';
import { GetCommitDetailsUseCase } from '../../application/usecases/graph/get-commit-details';
import { GetWorktreeDetailsUseCase } from '../../application/usecases/graph/get-worktree-details';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { toProtocolBranch, toProtocolGraphCommit, toProtocolWorktree } from '../mapping/toProtocol';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { runCommitCommand } from '../commands/commit-commands';
import { runBranchCommand } from '../commands/branch-commands';
import { runWorktreeCommand } from '../commands/worktree-commands';
import { createErrorPayload, isAbortError } from './errorSerialization';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;

export class GraphMessageRouter {
    private readonly pending = new Map<string, AbortController>();

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
        private readonly getGraphData = new GetGraphDataUseCase(),
        private readonly getCommitDetails = new GetCommitDetailsUseCase(),
        private readonly getWorktreeDetails = new GetWorktreeDetailsUseCase(),
    ) {}

    dispose(): void {
        for (const ctrl of this.pending.values()) { ctrl.abort(); }
        this.pending.clear();
    }

    async handle(msg: GraphWebviewToExtensionMessage): Promise<void> {
        try {
            await this.dispatch(msg);
        } catch (error) {
            if (isAbortError(error)) { return; }
            this.postGraphError(error, {
                requestId: requestIdOf(msg),
                operation: msg.type,
                code: errorCodeFor(msg),
                notifyUser: shouldNotifyUserForError(msg),
            });
            if (shouldRefreshAfterFailedRepositoryMutation(msg)) {
                await this.refreshAfterError();
            }
        }
    }

    private async dispatch(msg: GraphWebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'graph/ready':
                break;

            case 'graph/refresh':
                this.requestGraphRefresh();
                break;

            case 'graph/dataRequest': {
                const key = msg.repoId;
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/loadMore': {
                const key = `${msg.repoId}:more`;
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, 0, msg.page.offset + msg.page.limit, ctrl.signal);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/commitDetailsRequest': {
                const repo = this.repositories.requireRepository();
                const details = await this.getCommitDetails.execute(repo, msg.hash);
                const response: CommitDetailsResponse = {
                    type: 'graph/commitDetailsResponse',
                    requestId: msg.requestId,
                    hash: details.hash,
                    fullMessage: details.fullMessage,
                    files: details.files.map((file) => ({
                        status: file.status,
                        filePath: file.filePath,
                        origPath: file.origPath,
                        parentHash: file.parentHash,
                    })),
                };
                this.postMessage(response);
                break;
            }

            case 'graph/worktreeDetailsRequest': {
                const repo = this.repositories.requireRepository();
                const details = await this.getWorktreeDetails.execute(repo, msg.path);
                const response: WorktreeDetailsResponse = {
                    type: 'graph/worktreeDetailsResponse',
                    requestId: msg.requestId,
                    path: details.path,
                    head: details.head,
                    branch: details.branch,
                    files: details.files,
                };
                this.postMessage(response);
                break;
            }

            case 'graph/repositoryCommand':
                await this.handleRepositoryCommand(msg.command);
                break;

            case 'graph/branchCommand':
                await this.handleBranchCommand(msg);
                break;

            case 'graph/worktreeCommand':
                await this.handleWorktreeCommand(msg);
                break;

            case 'graph/commitCommand':
                await this.handleCommitCommand(msg.command, msg.hash, msg.hashes);
                break;

            case 'graph/openDiff': {
                const repo = this.repositories.requireRepository();
                const { left, right } = await createDiffUris(repo.cwd, msg);
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${msg.commitHash.substring(0, 7)})`);
                break;
            }

            case 'graph/openWorktreeDiff': {
                const repo = this.repositories.requireRepository();
                const { left, right } = await createWorktreeDiffUris(repo, msg);
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${path.basename(msg.worktreePath)})`);
                break;
            }

            default:
                break;
        }
    }

    async pushGraphData(filters: GraphFilters | undefined, signal: AbortSignal | undefined): Promise<void> {
        try {
            const repo = this.repositories.currentRepository;
            if (!repo) {
                this.postMessage({ type: 'graph/dataPush', repoId: '', data: emptyGraphData() });
                return;
            }
            const data = await this.buildGraphData(filters ?? {}, 0, 300, signal);
            this.postMessage({ type: 'graph/dataPush', repoId: repo.cwd, data });
        } catch (error) {
            if (isAbortError(error)) { return; }
            this.postGraphError(error, { operation: 'graph/refresh', code: 'refreshFailed' });
        }
    }

    private async buildGraphData(
        filters: GraphFilters,
        offset: number,
        limit: number,
        signal?: AbortSignal,
    ): Promise<GraphData> {
        const repo = this.repositories.requireRepository();
        const result = await this.getGraphData.execute(repo, filters, { offset, limit }, signal);
        for (const warning of result.warnings) {
            this.postGraphError(warning.error, {
                operation: warning.operation,
                code: 'optionalDataUnavailable',
            });
        }
        return toProtocolGraphData(result);
    }

    private async handleRepositoryCommand(command: GraphRepositoryCommand): Promise<void> {
        const repo = this.repositories.requireRepository();
        switch (command) {
            case 'fetch':
                await this.remoteCommands.runVscode(repo, VscodeRemoteCommand.FetchAll);
                break;
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleBranchCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/branchCommand' }>): Promise<void> {
        const repo = this.repositories.requireRepository();
        const shouldRefresh = await runBranchCommand(repo, msg.command, msg.branch, msg.isRemote, this.remoteCommands);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private async handleWorktreeCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/worktreeCommand' }>): Promise<void> {
        const repo = this.repositories.requireRepository();
        const shouldRefresh = await runWorktreeCommand(repo, msg.command, msg.path, this.remoteCommands);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private async handleCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[]): Promise<void> {
        const repo = this.repositories.requireRepository();
        const shouldRefresh = await runCommitCommand(repo, command, hash, hashes, this.remoteCommands);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private postGraphError(
        error: unknown,
        options: { readonly requestId?: RequestId; readonly operation: string; readonly code: ErrorCode; readonly notifyUser?: boolean },
    ): void {
        const payload = createErrorPayload(error, {
            code: options.code,
            operation: options.operation,
            recoverable: true,
        });
        this.postMessage({
            type: 'graph/error',
            requestId: options.requestId,
            ...payload,
        });
        if (options.notifyUser) {
            void vscode.window.showErrorMessage(payload.message);
        }
    }

    private async refreshAfterRepositoryChange(): Promise<void> {
        this.requestGraphRefresh();
        await this.onRepositoryUpdated();
    }

    private async refreshAfterError(): Promise<void> {
        try {
            await this.refreshAfterRepositoryChange();
        } catch (error) {
            this.postGraphError(error, {
                operation: 'graph/refreshAfterError',
                code: 'refreshFailed',
            });
        }
    }

    requestGraphRefresh(): void {
        this.postMessage({ type: 'graph/refreshRequested' });
    }
}

function toProtocolGraphData(result: GraphDataResult): GraphData {
    return {
        branches: result.branches.map(toProtocolBranch),
        tags: result.tags.map((tag) => ({ name: tag.name, hash: tag.hash })),
        commits: result.commits.map(toProtocolGraphCommit),
        currentBranch: result.currentBranch,
        currentUser: result.currentUser,
        hasMore: result.hasMore,
        loadedCount: result.loadedCount,
        totalCount: result.totalCount,
        hasRemotes: result.hasRemotes,
        worktrees: result.worktrees.map(toProtocolWorktree),
        worktreeWips: result.worktreeWips,
    };
}

function requestIdOf(msg: GraphWebviewToExtensionMessage): RequestId | undefined {
    return 'requestId' in msg ? msg.requestId : undefined;
}

function errorCodeFor(msg: GraphWebviewToExtensionMessage): ErrorCode {
    if (msg.type === 'graph/openDiff' || msg.type === 'graph/openWorktreeDiff') { return 'vscodeCommandFailed'; }
    return 'gitOperationFailed';
}

function shouldNotifyUserForError(msg: GraphWebviewToExtensionMessage): boolean {
    return msg.type === 'graph/branchCommand'
        || msg.type === 'graph/commitCommand'
        || msg.type === 'graph/worktreeCommand'
        || msg.type === 'graph/repositoryCommand'
        || msg.type === 'graph/openDiff'
        || msg.type === 'graph/openWorktreeDiff';
}

function shouldRefreshAfterFailedRepositoryMutation(msg: GraphWebviewToExtensionMessage): boolean {
    switch (msg.type) {
        case 'graph/branchCommand':
            return msg.command === 'checkoutRebaseOnto'
                || msg.command === 'rebaseOnto'
                || msg.command === 'mergeInto'
                || (msg.command === 'update' && !msg.isRemote);
        case 'graph/commitCommand':
            return msg.command === 'cherryPick'
                || msg.command === 'revertCommit'
                || msg.command === 'dropCommit'
                || msg.command === 'editCommitMessage'
                || msg.command === 'fixup'
                || msg.command === 'squashInto'
                || msg.command === 'resetCurrentBranchToHere'
                || msg.command === 'undoCommit';
        case 'graph/worktreeCommand':
            return msg.command === 'pull'
                || msg.command === 'checkoutBranch'
                || msg.command === 'commit'
                || msg.command === 'stash';
        default:
            return false;
    }
}

async function createDiffUris(cwd: string, msg: OpenDiffRequest): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const fileUri = vscode.Uri.file(path.join(cwd, msg.filePath));
    const origUri = msg.origPath ? vscode.Uri.file(path.join(cwd, msg.origPath)) : fileUri;
    const parentRef = msg.parentHash ?? `${msg.commitHash}~1`;
    const status = msg.status.charAt(0);

    if (status === 'A') {
        return {
            left: await emptyDiffUri(msg.commitHash, msg.filePath, 'parent'),
            right: toGitUri(fileUri, msg.commitHash),
        };
    }

    if (status === 'D') {
        return {
            left: toGitUri(origUri, parentRef),
            right: await emptyDiffUri(msg.commitHash, msg.filePath, 'commit'),
        };
    }

    return {
        left: toGitUri(origUri, parentRef),
        right: toGitUri(fileUri, msg.commitHash),
    };
}

async function createWorktreeDiffUris(repo: GitRepository, msg: OpenWorktreeDiffRequest): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const fileUri = vscode.Uri.file(path.join(msg.worktreePath, msg.filePath));
    const origPath = msg.origPath ?? msg.filePath;
    const status = msg.status.charAt(0);

    if (status === '?' || status === 'A') {
        return {
            left: await emptyDiffUri('worktree', msg.filePath, 'head'),
            right: fileUri,
        };
    }

    if (status === 'D') {
        return {
            left: await worktreeHeadBlobUri(repo, msg.worktreePath, origPath),
            right: await emptyDiffUri('worktree', msg.filePath, 'working-tree'),
        };
    }

    return {
        left: await worktreeHeadBlobUri(repo, msg.worktreePath, origPath),
        right: fileUri,
    };
}

async function emptyDiffUri(commitHash: string, filePath: string, side: string): Promise<vscode.Uri> {
    return tempDiffUri(commitHash, filePath, side, '');
}

async function worktreeHeadBlobUri(repo: GitRepository, worktreePath: string, filePath: string): Promise<vscode.Uri> {
    const content = await repo.execRaw(['-C', worktreePath, 'show', `HEAD:${filePath}`]);
    return tempDiffUri('worktree-head', filePath, 'head', content);
}

async function tempDiffUri(namespace: string, filePath: string, side: string, content: string): Promise<vscode.Uri> {
    const dir = path.join(os.tmpdir(), 'look-git-empty-diffs');
    const safeNamespace = Buffer.from(namespace).toString('base64url').substring(0, 16);
    const fileName = `${safeNamespace}-${side}-${Buffer.from(filePath).toString('base64url')}`;
    const emptyPath = path.join(dir, fileName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(emptyPath, content);
    return vscode.Uri.file(emptyPath);
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.path, ref }) });
}

function emptyGraphData(): GraphData {
    return {
        branches: [],
        tags: [],
        commits: [],
        currentBranch: '',
        currentUser: '',
        hasMore: false,
        loadedCount: 0,
        totalCount: 0,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
    };
}
