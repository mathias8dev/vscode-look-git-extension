import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { GraphWebviewToExtensionMessage, GraphExtensionToWebviewMessage, GraphDataResponse, CommitDetailsResponse, OpenDiffRequest } from '../../protocol/graph/messages';
import type { GraphData, GraphFilters } from '../../protocol/graph/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { toProtocolBranch, toProtocolGraphCommit, toProtocolWorktree } from '../mapping/toProtocol';
import { showModalWarningMessage } from '../utils/confirmation';
import { createErrorPayload, isAbortError } from './errorSerialization';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;

export class GraphMessageRouter {
    private readonly pending = new Map<string, AbortController>();

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
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
            });
        }
    }

    private async dispatch(msg: GraphWebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'graph/ready':
            case 'graph/refresh':
                await this.pushGraphData(undefined, undefined);
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
                const [files, fullMessage] = await Promise.all([
                    repo.getCommitFiles(msg.hash),
                    repo.getCommitMessage(msg.hash),
                ]);
                const response: CommitDetailsResponse = {
                    type: 'graph/commitDetailsResponse',
                    requestId: msg.requestId,
                    hash: msg.hash,
                    fullMessage,
                    files: files.map((f) => ({
                        status: f.status,
                        filePath: f.filePath,
                        origPath: f.origPath,
                        parentHash: f.parentHash,
                    })),
                };
                this.postMessage(response);
                break;
            }

            case 'graph/branchCommand':
                await this.handleBranchCommand(msg.command, msg.branch, msg.isRemote);
                break;

            case 'graph/worktreeCommand':
                await this.handleWorktreeCommand(msg.command, msg.path);
                break;

            case 'graph/openDiff': {
                const repo = this.repositories.requireRepository();
                const { left, right } = await createDiffUris(repo.cwd, msg);
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${msg.commitHash.substring(0, 7)})`);
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
        const maxCount = offset + limit + 1;
        const [rawCommits, branches, tags, currentUser, remotesResult, worktreesResult] = await Promise.all([
            repo.getGraphLog(maxCount, filters.branches, filters.path, {
                search: filters.search,
                authors: filters.authors,
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
            }, signal),
            repo.getAllBranches(signal),
            repo.getAllTags(signal),
            repo.getUserName(signal),
            settleOptional(repo.getRemotes(signal)),
            settleOptional(repo.listWorktrees(signal)),
        ]);
        const remotes = this.optionalResultOrEmpty(remotesResult, 'graph/listRemotes');
        const worktrees = this.optionalResultOrEmpty(worktreesResult, 'graph/listWorktrees');

        const sliced = rawCommits.slice(offset, offset + limit);
        const hasMore = rawCommits.length > offset + limit;
        const currentBranch = branches.find((b) => b.isCurrent)?.name ?? 'HEAD';

        return {
            branches: branches.map(toProtocolBranch),
            tags: tags.map((t) => ({ name: t.name, hash: t.hash })),
            commits: sliced.map(toProtocolGraphCommit),
            currentBranch,
            currentUser,
            hasMore,
            loadedCount: sliced.length,
            totalCount: rawCommits.length,
            hasRemotes: remotes.length > 0,
            worktrees: worktrees.map(toProtocolWorktree),
        };
    }

    private async handleBranchCommand(command: string, branch: string, isRemote: boolean): Promise<void> {
        const repo = this.repositories.requireRepository();
        const currentBranch = await repo.getCurrentBranch();
        switch (command) {
            case 'checkout':    await repo.checkout(branch); break;
            case 'newBranchFrom': {
                const name = await vscode.window.showInputBox({ prompt: `New branch from "${branch}":` });
                if (!name) { return; }
                await repo.checkoutNewBranch(name, branch);
                break;
            }
            case 'delete': {
                const label = `Delete${isRemote ? ' Remote' : ''}`;
                const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, label);
                if (choice !== label) { return; }
                if (isRemote) {
                    const slashIdx = branch.indexOf('/');
                    const remote = slashIdx === -1 ? 'origin' : branch.substring(0, slashIdx);
                    const remoteBranch = slashIdx === -1 ? branch : branch.substring(slashIdx + 1);
                    await repo.deleteRemoteBranch(remote, remoteBranch);
                } else {
                    await repo.deleteBranch(branch);
                }
                break;
            }
            case 'rename': {
                const name = await vscode.window.showInputBox({ prompt: `Rename "${branch}" to:`, value: branch });
                if (!name || name === branch) { return; }
                await repo.renameBranch(branch, name);
                break;
            }
            case 'push':         await repo.pushBranch('origin', branch); break;
            case 'update':       await repo.fetchBranch('origin', branch); break;
            case 'rebaseOnto':   await repo.rebase(branch); break;
            case 'mergeInto':    await repo.merge(branch); break;
            case 'checkoutRebaseOnto':
                await repo.checkout(branch);
                await repo.rebase(currentBranch);
                break;
        }
        await this.pushGraphData(undefined, undefined);
    }

    private async handleWorktreeCommand(command: string, wtPath?: string): Promise<void> {
        const repo = this.repositories.requireRepository();
        switch (command) {
            case 'open':
                if (wtPath) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(wtPath), { forceNewWindow: true });
                }
                break;
            case 'add': {
                const p = await vscode.window.showInputBox({ prompt: 'Worktree path (absolute):' });
                if (!p) { return; }
                const b = await vscode.window.showInputBox({ prompt: 'Branch name:' });
                if (!b) { return; }
                const branches = await repo.getAllBranches();
                const createNew = !branches.some((br) => br.name === b);
                await repo.addWorktree(p, b, createNew);
                await this.pushGraphData(undefined, undefined);
                break;
            }
            case 'remove':
            case 'removeForce': {
                if (!wtPath) { return; }
                const force = command === 'removeForce';
                const label = force ? 'Remove (Force)' : 'Remove';
                const choice = await showModalWarningMessage(
                    `Remove worktree at "${wtPath}"?${force ? ' Uncommitted changes will be lost.' : ''}`, label,
                );
                if (choice !== label) { return; }
                await repo.removeWorktree(wtPath, force);
                await this.pushGraphData(undefined, undefined);
                break;
            }
        }
    }

    private postGraphError(
        error: unknown,
        options: { readonly requestId?: RequestId; readonly operation: string; readonly code: ErrorCode },
    ): void {
        this.postMessage({
            type: 'graph/error',
            requestId: options.requestId,
            ...createErrorPayload(error, {
                code: options.code,
                operation: options.operation,
                recoverable: true,
            }),
        });
    }

    private optionalResultOrEmpty<T>(
        result: PromiseSettledResult<readonly T[]>,
        operation: string,
    ): readonly T[] {
        if (result.status === 'fulfilled') { return result.value; }
        if (isAbortError(result.reason)) { throw result.reason; }
        this.postGraphError(result.reason, { operation, code: 'optionalDataUnavailable' });
        return [];
    }
}

async function settleOptional<T>(promise: Promise<readonly T[]>): Promise<PromiseSettledResult<readonly T[]>> {
    return promise.then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason: unknown) => ({ status: 'rejected', reason }) as const,
    );
}

function requestIdOf(msg: GraphWebviewToExtensionMessage): RequestId | undefined {
    return 'requestId' in msg ? msg.requestId : undefined;
}

function errorCodeFor(msg: GraphWebviewToExtensionMessage): ErrorCode {
    if (msg.type === 'graph/openDiff') { return 'vscodeCommandFailed'; }
    return 'gitOperationFailed';
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
    };
}
