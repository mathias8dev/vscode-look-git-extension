import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { BranchCommand, CommitCommand, GraphRepositoryCommand, WorktreeCommand, GraphWebviewToExtensionMessage, GraphExtensionToWebviewMessage, GraphDataResponse, CommitDetailsResponse, WorktreeDetailsResponse, OpenDiffRequest, OpenWorktreeDiffRequest } from '../../protocol/graph/messages';
import type { CommitFileChange, GraphData, GraphFilters, WorktreeWip } from '../../protocol/graph/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { GitRepository } from '../../core/git/GitRepository';
import type { GitStatusEntry } from '../../core/git/domain/GitStatus';
import type { GitWorktree } from '../../core/git/domain/GitWorktree';
import type { DiffNameStatusEntry } from '../../core/parsing/parse-diff-name-status';
import { parseDiffNameStatus } from '../../core/parsing/parse-diff-name-status';
import { parsePorcelainStatus, summarizePorcelainStatus } from '../../core/parsing/parseStatus';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { toProtocolBranch, toProtocolGraphCommit, toProtocolWorktree } from '../mapping/toProtocol';
import { showModalWarningMessage } from '../utils/confirmation';
import { openReadonlyDiffDocument } from '../utils/readonly-diff-documents';
import { createErrorPayload, isAbortError } from './errorSerialization';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;
type ChangesResource = readonly [vscode.Uri, vscode.Uri, vscode.Uri];

export class GraphMessageRouter {
    private readonly pending = new Map<string, AbortController>();

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
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

            case 'graph/worktreeDetailsRequest': {
                const repo = this.repositories.requireRepository();
                const worktree = (await repo.listWorktrees()).find((wt) => wt.path === msg.path);
                if (!worktree) { throw new Error(`Unknown worktree: ${msg.path}`); }
                const raw = await repo.execRaw(['-C', worktree.path, 'status', '--porcelain=v1', '-z', '-u']);
                const response: WorktreeDetailsResponse = {
                    type: 'graph/worktreeDetailsResponse',
                    requestId: msg.requestId,
                    path: worktree.path,
                    head: worktree.head,
                    branch: worktree.branch,
                    files: porcelainStatusFiles(raw),
                };
                this.postMessage(response);
                break;
            }

            case 'graph/repositoryCommand':
                await this.handleRepositoryCommand(msg.command);
                break;

            case 'graph/branchCommand':
                await this.handleBranchCommand(msg.command, msg.branch, msg.isRemote);
                break;

            case 'graph/worktreeCommand':
                await this.handleWorktreeCommand(msg.command, msg.path);
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

        const wipResults = await Promise.all(worktrees.map(async (wt): Promise<WorktreeWip | undefined> => {
            try {
                const raw = await repo.execRaw(['-C', wt.path, 'status', '--porcelain=v1', '-z', '-u'], signal);
                const counts = summarizePorcelainStatus(raw);
                return {
                    path: wt.path,
                    head: wt.head,
                    branch: wt.branch,
                    ...counts,
                };
            } catch (error) {
                if (isAbortError(error)) { throw error; }
                this.postGraphError(error, { operation: 'graph/worktreeWipStatus', code: 'optionalDataUnavailable' });
                return undefined;
            }
        }));
        const worktreeWips = wipResults
            .filter((wip): wip is WorktreeWip => wip !== undefined && wip.staged + wip.unstaged + wip.untracked + wip.conflicts > 0);

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
            worktreeWips,
        };
    }

    private async handleRepositoryCommand(command: GraphRepositoryCommand): Promise<void> {
        const repo = this.repositories.requireRepository();
        switch (command) {
            case 'fetch':
                await repo.fetchAll();
                break;
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleBranchCommand(command: BranchCommand, branch: string, isRemote: boolean): Promise<void> {
        const repo = this.repositories.requireRepository();
        const currentBranch = await repo.getCurrentBranch();
        switch (command) {
            case 'checkout':
                await checkoutBranch(repo, branch, isRemote);
                break;
            case 'newBranchFrom': {
                const name = await vscode.window.showInputBox({
                    prompt: `Create branch from "${branch}":`,
                    value: isRemote ? localBranchNameForRemote(branch) : undefined,
                });
                if (!name) { return; }
                await repo.checkoutNewBranch(name, branch);
                break;
            }
            case 'checkoutRebaseOnto':
                await assertNoUnmergedFiles(repo, 'checking out and rebasing branches');
                await checkoutBranch(repo, branch, isRemote);
                await repo.exec(['rebase', currentBranch]);
                break;
            case 'newWorktreeFromBranch':
                if (!await createWorktreeFromBranch(repo, branch, isRemote)) { return; }
                break;
            case 'openBranchWorktree':
                await openBranchWorktree(repo, branch, isRemote);
                return;
            case 'revealBranchWorktree':
                await revealBranchWorktree(repo, branch, isRemote);
                return;
            case 'compareWithCurrent':
                await openChangesBetweenMergeBaseAndRef(repo, currentBranch, branch, `Diff ${currentBranch}...${branch}`);
                return;
            case 'showDiffWithWorkingTree':
                await openChangesWithWorkingTree(repo, repo.cwd, branch, `Diff ${branch}..working tree`);
                return;
            case 'compareBranchWithWorktree':
                await compareRefWithPickedWorktree(repo, branch, `Diff ${branch}`);
                return;
            case 'showDiffWithBranchWorktree':
                await showDiffWithBranchWorktree(repo, branch, isRemote);
                return;
            case 'delete': {
                const label = `Delete${isRemote ? ' Remote' : ''}`;
                const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, label);
                if (choice !== label) { return; }
                if (isRemote) {
                    const { remote, branchName } = await resolveRemoteBranch(repo, branch);
                    await repo.deleteRemoteBranch(remote, branchName);
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
            case 'push':
                if (isRemote) { throw new Error('Push is only available for local branches.'); }
                await pushBranch(repo, branch);
                break;
            case 'pullBranchWorktree':
                await branchWorktreeGit(repo, branch, isRemote, ['pull']);
                break;
            case 'pushBranchWorktree':
                await pushBranchWorktree(repo, branch, isRemote);
                break;
            case 'lockBranchWorktree':
                await lockBranchWorktree(repo, branch, isRemote);
                break;
            case 'unlockBranchWorktree':
                await unlockBranchWorktree(repo, branch, isRemote);
                break;
            case 'removeBranchWorktree':
                if (!await removeBranchWorktree(repo, branch, isRemote)) { return; }
                break;
            case 'update': {
                if (isRemote) { throw new Error('Update selected branch is only available for local branches.'); }
                await updateSelectedLocalBranch(repo, branch, currentBranch);
                break;
            }
            case 'rebaseOnto':
                await assertNoUnmergedFiles(repo, 'rebasing branches');
                await repo.rebase(branch);
                break;
            case 'mergeInto':
                await assertNoUnmergedFiles(repo, 'merging branches');
                await repo.merge(branch);
                break;
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleWorktreeCommand(command: WorktreeCommand, wtPath?: string): Promise<void> {
        const repo = this.repositories.requireRepository();
        switch (command) {
            case 'open': {
                const pathValue = requireWorktreePath(wtPath);
                const choice = await vscode.window.showQuickPick(['Open in New Window', 'Open in Current Window'], { placeHolder: 'Open worktree' });
                if (!choice) { return; }
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(pathValue), { forceNewWindow: choice === 'Open in New Window' });
                return;
            }
            case 'openInNewWindow':
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(requireWorktreePath(wtPath)), { forceNewWindow: true });
                return;
            case 'reveal':
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(requireWorktreePath(wtPath)));
                return;
            case 'showDiffWithHead': {
                const pathValue = requireWorktreePath(wtPath);
                await openChangesWithWorkingTree(repo, pathValue, 'HEAD', `Diff ${path.basename(pathValue)} with HEAD`);
                return;
            }
            case 'showDiffWithMainWorktree':
                await showDiffWithMainWorktree(repo, requireWorktreePath(wtPath));
                return;
            case 'fetch':
                await repo.exec(['-C', requireWorktreePath(wtPath), 'fetch']);
                break;
            case 'pull':
                await repo.exec(['-C', requireWorktreePath(wtPath), 'pull']);
                break;
            case 'push':
                await repo.exec(['-C', requireWorktreePath(wtPath), 'push']);
                break;
            case 'commit':
                if (!await commitWorktree(repo, requireWorktreePath(wtPath))) { return; }
                break;
            case 'stash':
                if (!await stashWorktree(repo, requireWorktreePath(wtPath))) { return; }
                break;
            case 'newBranch': {
                const branch = await vscode.window.showInputBox({ prompt: 'New branch from worktree HEAD:' });
                if (!branch?.trim()) { return; }
                await repo.exec(['-C', requireWorktreePath(wtPath), 'checkout', '-b', branch]);
                break;
            }
            case 'checkoutBranch': {
                const branches = (await repo.getAllBranches()).filter((branch) => !branch.isRemote).map((branch) => branch.name);
                const branch = await vscode.window.showQuickPick(branches, { placeHolder: 'Checkout branch in worktree' });
                if (!branch) { return; }
                await repo.exec(['-C', requireWorktreePath(wtPath), 'checkout', branch]);
                break;
            }
            case 'lock':
                await assertNotMainWorktree(repo, requireWorktreePath(wtPath), 'locked');
                await repo.exec(['worktree', 'lock', requireWorktreePath(wtPath)]);
                break;
            case 'unlock':
                await assertNotMainWorktree(repo, requireWorktreePath(wtPath), 'unlocked');
                await repo.exec(['worktree', 'unlock', requireWorktreePath(wtPath)]);
                break;
            case 'add': {
                const p = await vscode.window.showInputBox({ prompt: 'Worktree path (absolute):' });
                if (!p) { return; }
                const b = await vscode.window.showInputBox({ prompt: 'Branch name:' });
                if (!b) { return; }
                const branches = await repo.getAllBranches();
                const createNew = !branches.some((br) => br.name === b);
                await repo.addWorktree(p, b, createNew);
                break;
            }
            case 'remove':
            case 'removeForce': {
                const pathValue = requireWorktreePath(wtPath);
                await assertNotMainWorktree(repo, pathValue, 'removed');
                const force = command === 'removeForce';
                if (force) {
                    const choice = await showModalWarningMessage(`Force remove worktree at "${pathValue}"?`, 'Force Remove');
                    if (choice !== 'Force Remove') { return; }
                    const destructiveChoice = await showModalWarningMessage('Uncommitted changes in this worktree will be permanently lost.', 'Discard Changes and Remove');
                    if (destructiveChoice !== 'Discard Changes and Remove') { return; }
                } else {
                    const choice = await showModalWarningMessage(`Remove worktree at "${pathValue}"?`, 'Remove');
                    if (choice !== 'Remove') { return; }
                }
                await repo.removeWorktree(pathValue, force);
                break;
            }
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[]): Promise<void> {
        const repo = this.repositories.requireRepository();
        const shouldRefresh = await runCommitCommand(repo, command, hash, hashes);
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

export async function runCommitCommand(repo: GitRepository, command: CommitCommand, hash: string, hashes: readonly string[]): Promise<boolean> {
    const selected = normalizeSelectedHashes(hash, hashes);
    switch (command) {
        case 'copyRevisionNumber':
            await vscode.env.clipboard.writeText(hash);
            return false;
        case 'createPatch':
            await createPatchFile(repo, await orderSelectedCommits(repo, selected, 'oldestFirst'));
            return false;
        case 'cherryPick':
            await assertNoUnmergedFiles(repo, 'cherry-picking commits');
            await repo.exec(['cherry-pick', ...(await orderSelectedCommits(repo, selected, 'oldestFirst'))]);
            return true;
        case 'checkoutRevision':
            await repo.checkout(hash);
            return true;
        case 'showRepositoryAtRevision':
            await showRepositoryAtRevision(hash, repo.exec.bind(repo));
            return false;
        case 'compareWithLocal':
            await openChangesWithWorkingTree(repo, repo.cwd, hash, `Diff ${hash.substring(0, 7)}..local`);
            return false;
        case 'resetCurrentBranchToHere':
            await resetCurrentBranchToHere(repo, hash);
            return true;
        case 'revertCommit':
            await assertNoUnmergedFiles(repo, 'reverting commits');
            await repo.exec(['revert', '--no-edit', ...(await orderSelectedCommits(repo, selected, 'newestFirst'))]);
            return true;
        case 'undoCommit':
            await undoHeadCommit(repo, hash);
            return true;
        case 'editCommitMessage':
            await editCommitMessage(repo, hash);
            return true;
        case 'fixup':
            await autosquashStagedChanges(repo, hash, 'fixup');
            return true;
        case 'squashInto':
            await autosquashStagedChanges(repo, hash, 'squash');
            return true;
        case 'dropCommit':
            await dropCommits(repo, await orderSelectedCommits(repo, selected, 'newestFirst'));
            return true;
        case 'interactiveRebaseFromHere':
            openGitTerminal(repo.cwd, `git rebase --autostash -i ${shellQuote(hash)}`);
            return false;
        case 'pushAllUpToHere':
            await pushAllUpToHere(repo, hash);
            return true;
        case 'newBranch':
            await createBranchAtCommit(repo, hash);
            return true;
        case 'newTag':
            await createTagAtCommit(repo, hash);
            return true;
        case 'newWorktreeFromCommit':
            return createWorktreeFromCommit(repo, hash);
        case 'compareCommitWithWorktree':
            await compareRefWithPickedWorktree(repo, hash, `Diff ${hash.substring(0, 7)}`);
            return false;
    }
}

async function settleOptional<T>(promise: Promise<readonly T[]>): Promise<PromiseSettledResult<readonly T[]>> {
    return promise.then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason: unknown) => ({ status: 'rejected', reason }) as const,
    );
}

function requireWorktreePath(wtPath: string | undefined): string {
    if (!wtPath) { throw new Error('Worktree path is required.'); }
    return wtPath;
}

async function assertNotMainWorktree(repo: GitRepository, wtPath: string, operation: 'locked' | 'unlocked' | 'removed'): Promise<void> {
    const worktree = (await repo.listWorktrees()).find((candidate) => candidate.path === wtPath);
    if (worktree?.isMain) { throw new Error(`The main worktree cannot be ${operation}.`); }
}

async function showDiffWithMainWorktree(repo: GitRepository, wtPath: string): Promise<void> {
    const worktrees = await repo.listWorktrees();
    const main = worktrees.find((worktree) => worktree.isMain);
    const selected = worktrees.find((worktree) => worktree.path === wtPath);
    if (!main) { throw new Error('Main worktree not found.'); }
    if (!selected) { throw new Error(`Unknown worktree: ${wtPath}`); }
    if (selected.isMain) { throw new Error('Cannot compare the main worktree with itself.'); }
    await openChangesWithWorkingTree(repo, wtPath, main.head, `Diff ${path.basename(wtPath)} with ${path.basename(main.path)}`);
}

async function createWorktreeFromBranch(repo: GitRepository, branch: string, isRemote: boolean): Promise<boolean> {
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for "${branch}":`);
    if (!worktreePath) { return false; }
    const worktrees = await repo.listWorktrees();

    if (isRemote) {
        return createWorktreeFromRemoteBranch(repo, worktreePath, branch, worktrees);
    }

    if (worktreeForBranch(worktrees, branch)) {
        const branchName = await vscode.window.showInputBox({
            prompt: `Branch "${branch}" is already checked out. New branch name for worktree:`,
            value: `${branch}-worktree`,
        });
        if (!branchName?.trim()) { return false; }
        await repo.exec(['worktree', 'add', '-b', branchName.trim(), worktreePath, branch]);
        return true;
    }

    await repo.exec(['worktree', 'add', worktreePath, branch]);
    return true;
}

async function createWorktreeFromRemoteBranch(
    repo: GitRepository,
    worktreePath: string,
    remoteBranch: string,
    worktrees: readonly GitWorktree[],
): Promise<boolean> {
    const defaultLocalName = localNameForRemoteBranch(remoteBranch);
    const localBranches = (await repo.getAllBranches()).filter((branch) => !branch.isRemote).map((branch) => branch.name);

    if (localBranches.includes(defaultLocalName)) {
        if (!worktreeForBranch(worktrees, defaultLocalName)) {
            await repo.exec(['worktree', 'add', worktreePath, defaultLocalName]);
            return true;
        }
        const branchName = await vscode.window.showInputBox({
            prompt: `Branch "${defaultLocalName}" is already checked out. New branch name for worktree:`,
            value: `${defaultLocalName}-worktree`,
        });
        if (!branchName?.trim()) { return false; }
        await repo.exec(['worktree', 'add', '-b', branchName.trim(), worktreePath, remoteBranch]);
        return true;
    }

    const branchName = await vscode.window.showInputBox({
        prompt: `Local branch name for worktree from "${remoteBranch}":`,
        value: defaultLocalName,
    });
    if (!branchName?.trim()) { return false; }
    const trimmed = branchName.trim();
    if (localBranches.includes(trimmed)) {
        if (worktreeForBranch(worktrees, trimmed)) { throw new Error(`Branch "${trimmed}" is already checked out in another worktree.`); }
        await repo.exec(['worktree', 'add', worktreePath, trimmed]);
        return true;
    }
    await repo.exec(['worktree', 'add', '-b', trimmed, worktreePath, remoteBranch]);
    return true;
}

async function createWorktreeFromCommit(repo: GitRepository, hash: string): Promise<boolean> {
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for ${hash.substring(0, 7)}:`);
    if (!worktreePath) { return false; }
    const branchName = await vscode.window.showInputBox({
        prompt: `New branch name from ${hash.substring(0, 7)}:`,
    });
    if (!branchName?.trim()) { return false; }
    await repo.exec(['worktree', 'add', '-b', branchName.trim(), worktreePath, hash]);
    return true;
}

async function promptNewWorktreePath(repo: GitRepository, prompt: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ prompt, placeHolder: '/absolute/path/to/worktree' });
    if (!input?.trim()) { return undefined; }
    const worktreePath = input.trim();
    if (!path.isAbsolute(worktreePath)) { throw new Error('Worktree path must be absolute.'); }
    if (path.resolve(worktreePath) === path.resolve(repo.cwd)) { throw new Error('Worktree path already exists.'); }
    if (await pathExists(worktreePath)) { throw new Error('Worktree path already exists.'); }
    return worktreePath;
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return false; }
        throw error;
    }
}

function localNameForRemoteBranch(branch: string): string {
    const slashIdx = branch.indexOf('/');
    return slashIdx === -1 ? branch : branch.substring(slashIdx + 1);
}

async function openBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    const choice = await vscode.window.showQuickPick(['Open in New Window', 'Open in Current Window'], { placeHolder: 'Open branch worktree' });
    if (!choice) { return; }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktree.path), { forceNewWindow: choice === 'Open in New Window' });
}

async function revealBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(worktree.path));
}

async function showDiffWithBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await openChangesWithWorkingTree(repo, worktree.path, branch, `Diff ${branch} with ${path.basename(worktree.path)}`);
}

async function compareRefWithPickedWorktree(repo: GitRepository, ref: string, titlePrefix: string): Promise<boolean> {
    const worktree = await pickWorktree(repo, 'Select worktree to compare');
    if (!worktree) { return false; }
    await openChangesWithWorkingTree(repo, worktree.path, ref, `${titlePrefix} with ${path.basename(worktree.path)}`);
    return true;
}

async function branchWorktreeGit(repo: GitRepository, branch: string, isRemote: boolean, args: readonly string[]): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await repo.exec(['-C', worktree.path, ...args]);
}

async function pushBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    const upstream = (await repo.execRaw(['-C', worktree.path, 'for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    if (upstream) {
        const { remote, branchName } = await resolveRemoteBranch(repo, upstream);
        await repo.exec(['-C', worktree.path, 'push', remote, `${branch}:refs/heads/${branchName}`]);
        return;
    }
    const remote = await defaultRemote(repo);
    await repo.exec(['-C', worktree.path, 'push', '-u', remote, branch]);
}

async function lockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be locked.'); }
    await repo.exec(['worktree', 'lock', worktree.path]);
}

async function unlockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be unlocked.'); }
    await repo.exec(['worktree', 'unlock', worktree.path]);
}

async function removeBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<boolean> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be removed.'); }
    const choice = await showModalWarningMessage(`Remove worktree at "${worktree.path}"?`, 'Remove');
    if (choice !== 'Remove') { return false; }
    await repo.removeWorktree(worktree.path, false);
    return true;
}

async function requireWorktreeForBranch(repo: GitRepository, branch: string, isRemote: boolean): Promise<GitWorktree> {
    if (isRemote) { throw new Error('Remote branches do not have local worktrees.'); }
    const worktree = worktreeForBranch(await repo.listWorktrees(), branch);
    if (!worktree) { throw new Error(`No worktree is checked out for branch "${branch}".`); }
    return worktree;
}

async function pickWorktree(repo: GitRepository, placeHolder: string): Promise<GitWorktree | undefined> {
    const worktrees = await repo.listWorktrees();
    const paths = worktrees.map((worktree) => worktree.path);
    const selectedPath = await vscode.window.showQuickPick(paths, { placeHolder });
    return selectedPath ? worktrees.find((worktree) => worktree.path === selectedPath) : undefined;
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}

function worktreeForBranch(worktrees: readonly GitWorktree[], branch: string): GitWorktree | undefined {
    return worktrees.find((candidate) => shortWorktreeBranch(candidate.branch) === branch);
}

async function commitWorktree(repo: GitRepository, wtPath: string): Promise<boolean> {
    const raw = await repo.execRaw(['-C', wtPath, 'status', '--porcelain=v1', '-z', '-u']);
    const status = parsePorcelainStatus(raw);
    if (status.conflicts.length > 0) { throw new Error('Resolve conflicts before committing this worktree.'); }
    if (status.staged.length === 0 && status.unstaged.length === 0) { throw new Error('No changes to commit in this worktree.'); }

    if (status.staged.length === 0) {
        const choice = await showModalWarningMessage('No staged changes in this worktree. Stage all changes and commit?', 'Stage All and Commit');
        if (choice !== 'Stage All and Commit') { return false; }
        await repo.exec(['-C', wtPath, 'add', '-A']);
    } else if (status.unstaged.length > 0) {
        const choice = await vscode.window.showQuickPick(['Commit Staged Changes', 'Stage All and Commit'], { placeHolder: 'This worktree also has unstaged changes.' });
        if (!choice) { return false; }
        if (choice === 'Stage All and Commit') {
            await repo.exec(['-C', wtPath, 'add', '-A']);
        }
    }

    const message = await vscode.window.showInputBox({ prompt: 'Commit message:' });
    if (!message?.trim()) { return false; }
    await repo.exec(['-C', wtPath, 'commit', '-m', message]);
    return true;
}

async function stashWorktree(repo: GitRepository, wtPath: string): Promise<boolean> {
    const message = await vscode.window.showInputBox({ prompt: 'Stash message:', placeHolder: 'Optional' });
    if (message === undefined) { return false; }
    const args = ['-C', wtPath, 'stash', 'push', '-u'];
    if (message.trim()) { args.push('-m', message.trim()); }
    await repo.exec(args);
    return true;
}

function porcelainStatusFiles(raw: string): readonly CommitFileChange[] {
    const status = parsePorcelainStatus(raw);
    const files = new Map<string, CommitFileChange>();

    for (const entry of status.conflicts) {
        files.set(statusFileKey(entry), statusEntryFile(entry, 'U'));
    }
    for (const entry of status.staged) {
        mergeStatusFile(files, entry, statusCode(entry.indexStatus));
    }
    for (const entry of status.unstaged) {
        mergeStatusFile(files, entry, statusCode(entry.indexStatus === '?' ? '?' : entry.workTreeStatus));
    }

    return [...files.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function mergeStatusFile(files: Map<string, CommitFileChange>, entry: GitStatusEntry, status: string): void {
    const key = statusFileKey(entry);
    const existing = files.get(key);
    if (!existing) {
        files.set(key, statusEntryFile(entry, status));
        return;
    }
    if (!existing.status.includes(status)) {
        files.set(key, { ...existing, status: `${existing.status}${status}` });
    }
}

function statusEntryFile(entry: GitStatusEntry, status: string): CommitFileChange {
    return {
        status,
        filePath: entry.filePath,
        origPath: entry.origPath,
    };
}

function statusFileKey(entry: GitStatusEntry): string {
    return `${entry.filePath}\0${entry.origPath ?? ''}`;
}

function statusCode(status: string): string {
    return status === ' ' ? 'M' : status;
}

function normalizeSelectedHashes(hash: string, hashes: readonly string[]): string[] {
    const selected = hashes.length > 0 ? hashes : [hash];
    return Array.from(new Set(selected.includes(hash) ? selected : [hash, ...selected]));
}

async function createPatchFile(repo: GitRepository, hashes: readonly string[]): Promise<void> {
    const defaultUri = vscode.Uri.file(path.join(repo.cwd, `${hashes[0]?.substring(0, 7) ?? 'commit'}.patch`));
    const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { Patches: ['patch', 'diff'] },
    });
    if (!uri) { return; }
    const chunks = await Promise.all(hashes.map((hash) => repo.execRaw(['format-patch', '-1', '--stdout', hash])));
    await fs.writeFile(uri.fsPath, chunks.join('\n'));
}

async function checkoutBranch(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    if (!isRemote) {
        await repo.checkout(branch);
        return;
    }
    const trackingBranch = await localBranchTrackingRemote(repo, branch);
    if (trackingBranch) {
        await repo.checkout(trackingBranch);
        return;
    }
    await repo.exec(['checkout', '--track', branch]);
}

async function localBranchTrackingRemote(repo: GitRepository, remoteBranch: string): Promise<string | undefined> {
    const output = await repo.execRaw(['for-each-ref', '--format=%(refname:short)%00%(upstream:short)', 'refs/heads']);
    for (const line of output.split('\n')) {
        const [branch, upstream] = line.split('\0');
        if (branch && upstream === remoteBranch) { return branch; }
    }
    return undefined;
}

async function pushBranch(repo: GitRepository, branch: string): Promise<void> {
    const upstream = (await repo.execRaw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    if (upstream) {
        const { remote, branchName } = await resolveRemoteBranch(repo, upstream);
        await repo.exec(['push', remote, `${branch}:refs/heads/${branchName}`]);
        return;
    }
    const remote = await defaultRemote(repo);
    await repo.exec(['push', '-u', remote, branch]);
}

async function defaultRemote(repo: GitRepository): Promise<string> {
    const remotes = await repo.getRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    return remote;
}

async function resolveRemoteBranch(repo: GitRepository, branch: string): Promise<{ readonly remote: string; readonly branchName: string }> {
    const slashIdx = branch.indexOf('/');
    if (slashIdx === -1) {
        return { remote: await defaultRemote(repo), branchName: branch };
    }
    return {
        remote: branch.substring(0, slashIdx),
        branchName: branch.substring(slashIdx + 1),
    };
}

async function updateTargetForLocalBranch(repo: GitRepository, branch: string): Promise<{ readonly remote: string; readonly branchName: string }> {
    const upstream = (await repo.execRaw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    return resolveRemoteBranch(repo, upstream || branch);
}

async function updateSelectedLocalBranch(repo: GitRepository, branch: string, currentBranch: string): Promise<void> {
    const { remote, branchName } = await updateTargetForLocalBranch(repo, branch);
    await repo.fetchBranch(remote, branchName);
    const upstreamRef = `${remote}/${branchName}`;
    if (branch === currentBranch) {
        await repo.exec(['merge', '--ff-only', upstreamRef]);
        return;
    }
    await repo.exec(['merge-base', '--is-ancestor', branch, upstreamRef]);
    await repo.exec(['branch', '-f', branch, upstreamRef]);
}

function localBranchNameForRemote(branch: string): string | undefined {
    const slashIdx = branch.indexOf('/');
    return slashIdx === -1 ? undefined : branch.substring(slashIdx + 1);
}

async function showRepositoryAtRevision(
    hash: string,
    exec: (args: readonly string[]) => Promise<string>,
): Promise<void> {
    const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-revision-'));
    const worktreePath = path.join(parentPath, hash.substring(0, 7));
    await exec(['worktree', 'add', '--detach', worktreePath, hash]);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true });
}

async function openChangesBetweenMergeBaseAndRef(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const mergeBase = await repo.exec(['merge-base', leftRef, rightRef]);
    await openChangesBetweenRefs(repo, mergeBase, rightRef, title);
}

async function openChangesBetweenRefs(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const output = await repo.execRaw(['diff', '--name-status', '-z', leftRef, rightRef, '--']);
    const resources = await Promise.all(parseDiffNameStatus(output).map((entry) => refChangeResource(repo, leftRef, rightRef, entry)));
    await openChangesEditor(title, resources);
}

async function openChangesWithWorkingTree(repo: GitRepository, worktreePath: string, baseRef: string, title: string): Promise<void> {
    const resources = await workingTreeChangeResources(repo, worktreePath, baseRef);
    await openChangesEditor(title, resources);
}

async function openChangesEditor(title: string, resources: readonly ChangesResource[]): Promise<void> {
    if (resources.length === 0) {
        await openDiffDocument(title, 'No changes.\n');
        return;
    }
    await vscode.commands.executeCommand('vscode.changes', title, resources);
}

async function workingTreeChangeResources(repo: GitRepository, worktreePath: string, baseRef: string): Promise<readonly ChangesResource[]> {
    const tracked = parseDiffNameStatus(await repo.execRaw(['-C', worktreePath, 'diff', '--name-status', '-z', baseRef, '--']));
    const untracked = (await repo.execRaw(['-C', worktreePath, 'ls-files', '--others', '--exclude-standard', '-z']))
        .split('\0')
        .filter(Boolean)
        .map((filePath): DiffNameStatusEntry => ({ status: '?', filePath }));
    return Promise.all([...tracked, ...untracked].map((entry) => workingTreeChangeResource(repo, worktreePath, baseRef, entry)));
}

async function refChangeResource(repo: GitRepository, leftRef: string, rightRef: string, entry: DiffNameStatusEntry): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(repo.cwd, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A') {
        return [fileUri, await emptyDiffUri(rightRef, entry.filePath, 'original'), await refBlobUri(repo, repo.cwd, rightRef, entry.filePath, 'modified')];
    }
    if (entry.status === 'D') {
        return [fileUri, await refBlobUri(repo, repo.cwd, leftRef, origPath, 'original'), await emptyDiffUri(leftRef, entry.filePath, 'modified')];
    }
    return [
        fileUri,
        await refBlobUri(repo, repo.cwd, leftRef, origPath, 'original'),
        await refBlobUri(repo, repo.cwd, rightRef, entry.filePath, 'modified'),
    ];
}

async function workingTreeChangeResource(repo: GitRepository, worktreePath: string, baseRef: string, entry: DiffNameStatusEntry): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(worktreePath, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A' || entry.status === '?') {
        return [fileUri, await emptyDiffUri('working-tree', entry.filePath, 'original'), fileUri];
    }
    if (entry.status === 'D') {
        return [fileUri, await refBlobUri(repo, worktreePath, baseRef, origPath, 'original'), await emptyDiffUri(baseRef, entry.filePath, 'modified')];
    }
    return [fileUri, await refBlobUri(repo, worktreePath, baseRef, origPath, 'original'), fileUri];
}

async function refBlobUri(repo: GitRepository, cwd: string, ref: string, filePath: string, side: string): Promise<vscode.Uri> {
    const content = await repo.execRaw(['-C', cwd, 'show', `${ref}:${filePath}`]);
    return tempDiffUri(ref, filePath, side, content);
}

async function openDiffDocument(title: string, content: string): Promise<void> {
    await openReadonlyDiffDocument(title, content);
}

async function resetCurrentBranchToHere(repo: GitRepository, hash: string): Promise<void> {
    const mode = await vscode.window.showQuickPick(['Soft reset', 'Mixed reset', 'Hard reset', 'Keep reset'], { placeHolder: 'Reset current branch to selected revision' });
    if (!mode) { return; }
    if (mode === 'Hard reset') {
        const choice = await showModalWarningMessage('Hard reset current branch and discard working tree changes?', 'Hard Reset');
        if (choice !== 'Hard Reset') { return; }
    }
    const flag = mode === 'Soft reset'
        ? '--soft'
        : mode === 'Hard reset'
            ? '--hard'
            : mode === 'Keep reset'
                ? '--keep'
                : '--mixed';
    await repo.exec(['reset', flag, hash]);
}

async function undoHeadCommit(repo: GitRepository, hash: string): Promise<void> {
    const head = await repo.exec(['rev-parse', 'HEAD']);
    if (head !== hash) { throw new Error('Only the current HEAD commit can be undone.'); }
    const choice = await showModalWarningMessage('Undo the current HEAD commit and keep its changes staged?', 'Undo Commit');
    if (choice !== 'Undo Commit') { return; }
    await repo.exec(['reset', '--soft', 'HEAD~1']);
}

async function editCommitMessage(repo: GitRepository, hash: string): Promise<void> {
    const current = await repo.getCommitMessage(hash);
    const message = await vscode.window.showInputBox({ prompt: 'New commit message:', value: current });
    if (!message?.trim()) { return; }
    const messageFile = await writeCommitMessageFile(message);
    try {
        await rewriteCommitMessage(repo, hash, messageFile);
    } finally {
        await fs.rm(path.dirname(messageFile), { recursive: true, force: true });
    }
}

async function rewriteCommitMessage(repo: GitRepository, hash: string, messageFile: string): Promise<void> {
    await assertNoUnmergedFiles(repo, 'editing commit messages');
    const parents = (await repo.exec(['show', '-s', '--format=%P', hash])).split(/\s+/).filter(Boolean);
    if (parents.length > 1) { throw new Error('Editing merge commit messages is not supported yet.'); }
    const currentBranch = await repo.getCurrentBranch();
    const branches = await localBranchesContaining(repo, hash);
    const head = await repo.exec(['rev-parse', 'HEAD']);
    if (branches.length === 0 && head !== hash) {
        throw new Error('Edit Commit Message requires a local branch that contains the selected commit.');
    }
    const [authorName, authorEmail, authorDate] = (await repo.exec(['show', '-s', '--format=%an%x00%ae%x00%aI', hash])).split('\0');
    if (!authorName || !authorEmail || !authorDate) { throw new Error('Could not read commit author metadata.'); }
    const tree = await repo.exec(['show', '-s', '--format=%T', hash]);
    const parentArgs = parents[0] ? ['-p', parents[0]] : [];
    const rewritten = await repo.execWithEnv(
        ['commit-tree', tree, ...parentArgs, '-F', messageFile],
        {
            GIT_AUTHOR_NAME: authorName,
            GIT_AUTHOR_EMAIL: authorEmail,
            GIT_AUTHOR_DATE: authorDate,
        },
    );
    if (branches.length === 0) {
        await repo.exec(['reset', '--soft', rewritten]);
        return;
    }

    try {
        for (const branch of orderBranchesForRewrite(branches, currentBranch)) {
            await rewriteBranchContainingCommit(repo, branch, hash, rewritten, parents[0]);
        }
    } finally {
        if (currentBranch !== 'HEAD' && await repo.getCurrentBranch().catch(() => 'HEAD') !== currentBranch) {
            await repo.checkout(currentBranch);
        }
    }
}

async function localBranchesContaining(repo: GitRepository, hash: string): Promise<readonly string[]> {
    const output = await repo.execRaw(['for-each-ref', '--format=%(refname:short)', '--contains', hash, 'refs/heads']);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function orderBranchesForRewrite(branches: readonly string[], currentBranch: string): readonly string[] {
    if (currentBranch === 'HEAD' || !branches.includes(currentBranch)) { return branches; }
    return [...branches.filter((branch) => branch !== currentBranch), currentBranch];
}

async function rewriteBranchContainingCommit(
    repo: GitRepository,
    branch: string,
    hash: string,
    rewritten: string,
    parentHash: string | undefined,
): Promise<void> {
    const branchTip = await repo.exec(['rev-parse', branch]);
    const currentBranch = await repo.getCurrentBranch();
    if (branchTip === hash) {
        if (branch === currentBranch) {
            await repo.exec(['reset', '--soft', rewritten]);
        } else {
            await repo.exec(['update-ref', `refs/heads/${branch}`, rewritten, hash]);
        }
        return;
    }
    const rebaseArgs = parentHash
        ? ['rebase', '--autostash', '--onto', rewritten, hash, branch]
        : ['rebase', '--autostash', '--onto', rewritten, '--root', branch];
    await repo.exec(rebaseArgs);
}

async function writeCommitMessageFile(message: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-message-'));
    const filePath = path.join(dir, 'COMMIT_EDITMSG');
    await fs.writeFile(filePath, message);
    return filePath;
}

async function autosquashStagedChanges(repo: GitRepository, hash: string, mode: 'fixup' | 'squash'): Promise<void> {
    await assertNoUnmergedFiles(repo, mode === 'fixup' ? 'fixing up commits' : 'squashing commits');
    const stagedFiles = await repo.execRaw(['diff', '--cached', '--name-only']);
    if (!stagedFiles.trim()) { throw new Error('Stage changes before using Fixup or Squash Into.'); }
    const dirtyUnstaged = await repo.execRaw(['diff', '--name-only']);
    if (dirtyUnstaged.trim()) { throw new Error('Fixup and Squash Into require a clean unstaged working tree.'); }
    const parents = (await repo.exec(['show', '-s', '--format=%P', hash])).split(/\s+/).filter(Boolean);
    if (parents.length > 1) { throw new Error('Fixup and Squash Into are not supported for merge commits.'); }

    if (mode === 'fixup') {
        await repo.exec(['commit', '--fixup', hash, '--no-edit']);
    } else {
        const message = await vscode.window.showInputBox({ prompt: 'Squash commit message:' });
        if (!message?.trim()) { return; }
        await repo.exec(['commit', '--squash', hash, '-m', message]);
    }

    const branch = await repo.getCurrentBranch();
    const rebaseArgs = parents[0]
        ? ['rebase', '--autosquash', '--autostash', parents[0], branch]
        : ['rebase', '--autosquash', '--autostash', '--root', branch];
    await repo.execWithEnv(rebaseArgs, { GIT_SEQUENCE_EDITOR: 'true', GIT_EDITOR: 'true' });
}

async function dropCommits(repo: GitRepository, hashes: readonly string[]): Promise<void> {
    await assertNoUnmergedFiles(repo, 'dropping commits');
    const choice = await showModalWarningMessage(`Drop ${hashes.length === 1 ? 'this commit' : `${hashes.length} commits`}?`, 'Drop');
    if (choice !== 'Drop') { return; }
    for (const hash of hashes) {
        await repo.exec(['rebase', '--autostash', '--onto', `${hash}^`, hash]);
    }
}

async function assertNoUnmergedFiles(repo: GitRepository, operation: string): Promise<void> {
    const unmerged = await repo.execRaw(['diff', '--name-only', '--diff-filter=U']);
    if (unmerged.trim()) {
        throw new Error(`Resolve existing merge/rebase conflicts before ${operation}.`);
    }
}

async function orderSelectedCommits(repo: GitRepository, hashes: readonly string[], direction: 'newestFirst' | 'oldestFirst'): Promise<readonly string[]> {
    const unique = Array.from(new Set(hashes));
    if (unique.length <= 1) { return unique; }
    const selected = new Set(unique);
    const orderedNewestFirst = (await repo.exec(['rev-list', '--topo-order', ...unique]))
        .split(/\s+/)
        .filter((candidate) => selected.has(candidate));
    const orderedSet = new Set(orderedNewestFirst);
    const ordered = [
        ...orderedNewestFirst,
        ...unique.filter((candidate) => !orderedSet.has(candidate)),
    ];
    return direction === 'newestFirst' ? ordered : ordered.slice().reverse();
}

function openGitTerminal(cwd: string, command: string): void {
    const terminal = vscode.window.createTerminal({ name: 'Look Git', cwd });
    terminal.show();
    terminal.sendText(command);
}

async function pushAllUpToHere(repo: GitRepository, hash: string): Promise<void> {
    const remotes = await repo.getRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    const branch = await repo.getCurrentBranch();
    const choice = await showModalWarningMessage(`Push ${hash.substring(0, 7)} to ${remote}/${branch}?`, 'Push');
    if (choice !== 'Push') { return; }
    await repo.exec(['push', remote, `${hash}:refs/heads/${branch}`]);
}

async function createBranchAtCommit(repo: GitRepository, hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'New branch name:' });
    if (!name?.trim()) { return; }
    await repo.exec(['branch', name, hash]);
}

async function createTagAtCommit(repo: GitRepository, hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'New tag name:' });
    if (!name?.trim()) { return; }
    await repo.exec(['tag', name, hash]);
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
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
