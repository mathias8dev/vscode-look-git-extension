import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { BranchCommand, CommitCommand, GraphWebviewToExtensionMessage, GraphExtensionToWebviewMessage, GraphDataResponse, CommitDetailsResponse, WorktreeDetailsResponse, OpenDiffRequest, OpenWorktreeDiffRequest } from '../../protocol/graph/messages';
import type { CommitFileChange, GraphData, GraphFilters, WorktreeWip } from '../../protocol/graph/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { GitRepository } from '../../core/git/GitRepository';
import type { GitStatusEntry } from '../../core/git/domain/GitStatus';
import { parsePorcelainStatus, summarizePorcelainStatus } from '../../core/parsing/parseStatus';
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

    private async handleBranchCommand(command: BranchCommand, branch: string, isRemote: boolean): Promise<void> {
        const repo = this.repositories.requireRepository();
        const currentBranch = await repo.getCurrentBranch();
        switch (command) {
            case 'checkout':
                await checkoutBranch(repo, branch, isRemote);
                break;
            case 'newBranchFrom': {
                const name = await vscode.window.showInputBox({ prompt: `New branch from "${branch}":` });
                if (!name) { return; }
                await repo.checkoutNewBranch(name, branch);
                break;
            }
            case 'checkoutRebaseOnto':
                await assertNoUnmergedFiles(repo, 'checking out and rebasing branches');
                await checkoutBranch(repo, branch, isRemote);
                await repo.exec(['rebase', currentBranch]);
                break;
            case 'compareWithCurrent':
                await openDiffDocument(`Diff ${currentBranch}...${branch}`, await repo.execRaw(['diff', `${currentBranch}...${branch}`, '--']));
                return;
            case 'showDiffWithWorkingTree':
                await openDiffDocument(`Diff ${branch}..working tree`, await repo.execRaw(['diff', branch, '--']));
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
            case 'update': {
                const { remote, branchName } = await resolveRemoteBranch(repo, branch);
                await repo.fetchBranch(remote, branchName);
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

    private async handleCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[]): Promise<void> {
        const repo = this.repositories.requireRepository();
        const selected = normalizeSelectedHashes(hash, hashes);
        switch (command) {
            case 'copyRevisionNumber':
                await vscode.env.clipboard.writeText(hash);
                return;
            case 'createPatch':
                await createPatchFile(repo, await orderSelectedCommits(repo, selected, 'oldestFirst'));
                return;
            case 'cherryPick':
                await assertNoUnmergedFiles(repo, 'cherry-picking commits');
                await repo.exec(['cherry-pick', ...(await orderSelectedCommits(repo, selected, 'oldestFirst'))]);
                break;
            case 'checkoutRevision':
                await repo.checkout(hash);
                break;
            case 'showRepositoryAtRevision':
                await showRepositoryAtRevision(hash, repo.exec.bind(repo));
                return;
            case 'compareWithLocal':
                await openDiffDocument(`Diff ${hash.substring(0, 7)}..local`, await repo.execRaw(['diff', hash, '--']));
                return;
            case 'resetCurrentBranchToHere':
                await resetCurrentBranchToHere(repo, hash);
                break;
            case 'revertCommit':
                await assertNoUnmergedFiles(repo, 'reverting commits');
                await repo.exec(['revert', '--no-edit', ...(await orderSelectedCommits(repo, selected, 'newestFirst'))]);
                break;
            case 'undoCommit':
                await undoHeadCommit(repo, hash);
                break;
            case 'editCommitMessage':
                await editCommitMessage(repo, hash);
                break;
            case 'fixup':
                await autosquashStagedChanges(repo, hash, 'fixup');
                break;
            case 'squashInto':
                await autosquashStagedChanges(repo, hash, 'squash');
                break;
            case 'dropCommit':
                await dropCommits(repo, await orderSelectedCommits(repo, selected, 'newestFirst'));
                break;
            case 'interactiveRebaseFromHere':
                openGitTerminal(repo.cwd, `git rebase --autostash -i ${shellQuote(hash)}`);
                return;
            case 'pushAllUpToHere':
                await pushAllUpToHere(repo, hash);
                break;
            case 'newBranch':
                await createBranchAtCommit(repo, hash);
                break;
            case 'newTag':
                await createTagAtCommit(repo, hash);
                break;
        }
        await this.pushGraphData(undefined, undefined);
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
    await repo.exec(['checkout', '--track', branch]);
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

async function showRepositoryAtRevision(
    hash: string,
    exec: (args: readonly string[]) => Promise<string>,
): Promise<void> {
    const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-revision-'));
    const worktreePath = path.join(parentPath, hash.substring(0, 7));
    await exec(['worktree', 'add', '--detach', worktreePath, hash]);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true });
}

async function openDiffDocument(title: string, content: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content: content || `${title}\n`, language: 'diff' });
    await vscode.window.showTextDocument(document, { preview: false });
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
    const fileName = `${namespace.substring(0, 12)}-${side}-${Buffer.from(filePath).toString('base64url')}`;
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
