import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../core/git/GitRepository';
import type { GraphWebviewToExtensionMessage, GraphExtensionToWebviewMessage, GraphDataResponse, CommitDetailsResponse } from '../../protocol/graph/messages';
import type { GraphData, GraphFilters } from '../../protocol/graph/types';
import { assignLanes, getMaxLane } from '../../core/graph/GraphLaneAssigner';
import { queryAllBranches, queryAllTags, queryCurrentBranch, queryUserName, queryRemotes, queryCommitFiles, queryCommitMessage } from '../../core/queries/queryGraph';
import { queryWorktrees, addWorktree, removeWorktree } from '../../core/queries/queryWorktrees';
import { querySubmoduleStatus } from '../../core/queries/querySubmodules';
import { toProtocolSubmodule, toProtocolBranch, toProtocolWorktree } from '../mapping/toProtocol';
import { showModalWarningMessage } from '../utils/confirmation';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;

export class GraphMessageRouter {
    private readonly pending = new Map<string, AbortController>();

    constructor(
        private readonly repo: GitRepository,
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
            if ((error as Error).name === 'AbortError') { return; }
            const message = error instanceof Error ? error.message : String(error);
            this.postMessage({ type: 'graph/error', message });
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
                    this.pending.delete(key);
                }
                break;
            }

            case 'graph/loadMore': {
                const key = `${msg.repoId}:more`;
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                } finally {
                    this.pending.delete(key);
                }
                break;
            }

            case 'graph/commitDetailsRequest': {
                const [files, fullMessage] = await Promise.all([
                    this.repo.getCommitFiles(msg.hash),
                    this.repo.getCommitMessage(msg.hash),
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
                        isSubmodule: f.isSubmodule,
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

            case 'graph/submoduleCommand':
                await this.handleSubmoduleCommand(msg.command, msg.path);
                break;

            case 'graph/openDiff': {
                const cwd = this.repo.cwd;
                const fileUri = vscode.Uri.file(path.join(cwd, msg.filePath));
                const origUri = msg.origPath ? vscode.Uri.file(path.join(cwd, msg.origPath)) : fileUri;
                const commitHash = msg.commitHash;
                const parentRef = msg.parentHash ?? `${commitHash}~1`;
                const left = toGitUri(origUri, parentRef);
                const right = toGitUri(fileUri, commitHash);
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${commitHash.substring(0, 7)})`);
                break;
            }

            default:
                break;
        }
    }

    async pushGraphData(filters: GraphFilters | undefined, _signal: AbortSignal | undefined): Promise<void> {
        const data = await this.buildGraphData(filters ?? {}, 0, 300);
        this.postMessage({ type: 'graph/dataPush', repoId: this.repo.cwd, data });
    }

    private async buildGraphData(
        filters: GraphFilters,
        offset: number,
        limit: number,
        signal?: AbortSignal,
    ): Promise<GraphData> {
        const maxCount = offset + limit + 1;
        const [rawCommits, branches, tags, currentUser, remotes, worktrees, submodules] = await Promise.all([
            this.repo.getGraphLog(maxCount, filters.branches as string[] | undefined, filters.path, {
                search: filters.search,
                authors: filters.authors as string[] | undefined,
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
            }, signal),
            queryAllBranches(this.repo.execRaw.bind(this.repo), (s) => queryCurrentBranch(this.repo.exec.bind(this.repo), s), signal),
            queryAllTags(this.repo.execRaw.bind(this.repo), signal),
            queryUserName(this.repo.exec.bind(this.repo), signal),
            queryRemotes(this.repo.exec.bind(this.repo), signal),
            queryWorktrees(this.repo.execRaw.bind(this.repo), signal).catch(() => []),
            querySubmoduleStatus(this.repo.execRaw.bind(this.repo), signal).catch(() => []),
        ]);

        const sliced = rawCommits.slice(offset, offset + limit);
        const hasMore = rawCommits.length > offset + limit;
        const currentBranch = branches.find((b) => b.isCurrent)?.name ?? 'HEAD';
        const primaryBranch = filters.branches?.length === 1 ? filters.branches[0] : currentBranch;
        const primaryBranchHash = branches.find((b) => b.name === primaryBranch)?.hash;

        const rows = assignLanes(sliced, { primaryBranch, primaryBranchHash });
        const maxLane = getMaxLane(rows);

        return {
            branches: branches.map(toProtocolBranch),
            tags: tags.map((t) => ({ name: t.name, hash: t.hash })),
            rows,
            maxLane,
            currentBranch,
            currentUser,
            hasMore,
            loadedCount: sliced.length,
            totalCount: rawCommits.length,
            hasRemotes: remotes.length > 0,
            worktrees: worktrees.map(toProtocolWorktree),
            submodules: submodules.map(toProtocolSubmodule),
        };
    }

    private async handleBranchCommand(command: string, branch: string, isRemote: boolean): Promise<void> {
        const currentBranch = await this.repo.getCurrentBranch();
        switch (command) {
            case 'checkout':    await this.repo.checkout(branch); break;
            case 'newBranchFrom': {
                const name = await vscode.window.showInputBox({ prompt: `New branch from "${branch}":` });
                if (!name) { return; }
                await this.repo.checkoutNewBranch(name, branch);
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
                    await this.repo.deleteRemoteBranch(remote, remoteBranch);
                } else {
                    await this.repo.deleteBranch(branch);
                }
                break;
            }
            case 'rename': {
                const name = await vscode.window.showInputBox({ prompt: `Rename "${branch}" to:`, value: branch });
                if (!name || name === branch) { return; }
                await this.repo.renameBranch(branch, name);
                break;
            }
            case 'push':         await this.repo.pushBranch('origin', branch); break;
            case 'update':       await this.repo.fetchBranch('origin', branch); break;
            case 'rebaseOnto':   await this.repo.rebase(branch); break;
            case 'mergeInto':    await this.repo.merge(branch); break;
            case 'checkoutRebaseOnto':
                await this.repo.checkout(branch);
                await this.repo.rebase(currentBranch);
                break;
        }
        await this.pushGraphData(undefined, undefined);
    }

    private async handleWorktreeCommand(command: string, wtPath?: string): Promise<void> {
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
                const branches = await this.repo.getAllBranches();
                const createNew = !branches.some((br) => br.name === b);
                await addWorktree(this.repo.exec.bind(this.repo), p, b, createNew);
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
                await removeWorktree(this.repo.exec.bind(this.repo), wtPath, force);
                await this.pushGraphData(undefined, undefined);
                break;
            }
        }
    }

    private async handleSubmoduleCommand(command: string, subPath?: string): Promise<void> {
        switch (command) {
            case 'open':
                if (subPath) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path.join(this.repo.cwd, subPath)));
                }
                break;
            case 'initialize':
            case 'update':
                if (subPath) { await this.repo.updateSubmodule(subPath); }
                break;
            case 'fetch':
                if (subPath) { await this.repo.exec(['-C', subPath, 'fetch', '--all']); }
                break;
            case 'updateAll':
                await this.repo.updateAllSubmodules();
                break;
        }
        await this.pushGraphData(undefined, undefined);
    }
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.path, ref }) });
}
