import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { GitRepository } from '@application/ports/git-topology';
import { GetBranchComparison } from '@application/usecases/branches/get-branch-comparison';
import { GetComparisonCommits } from '@application/usecases/branches/get-comparison-commits';
import { GetCommitDetailsUseCase, type CommitDetailsResult } from '@application/usecases/graph/get-commit-details';
import type { GitBranch } from '@core/git/domain/git-status';
import type { ChangedFilesPage } from '@core/git/domain/git-comparison';
import type { GitCommit } from '@core/git/domain/git-commit';
import type { Page } from '@core/git/domain/page';
import type { ComparisonChannel, ComparisonRequest, ComparisonResponse } from '@protocol/comparison/messages';
import { ComparisonMode, type ComparisonBranch, type ComparisonCommit, type ComparisonFile, type ComparisonPage, type ComparisonSnapshot } from '@protocol/comparison/types';
import { isAbortError, serializeProtocolError } from '@extension/messaging/error-serialization';
import { openCommitFileDiff } from '@extension/utils/diff-uris';

interface ComparisonWebview {
    postMessage(message: ComparisonResponse): unknown;
}

export class ComparisonMessageRouter implements vscode.Disposable {
    private readonly pending = new Map<ComparisonChannel, AbortController>();
    private snapshot: ComparisonSnapshot | undefined;
    private readonly files = new Map<string, ComparisonFile>();
    private readonly commits = new Set<string>();
    private readonly details = new Map<string, CommitDetailsResult>();
    private disposed = false;
    private stale = false;

    constructor(
        private readonly repository: GitRepository,
        private readonly webview: ComparisonWebview,
        private readonly initialBase: string,
        private readonly initialHead: string,
    ) {}

    async handle(message: ComparisonRequest): Promise<void> {
        if (this.disposed) { return; }
        if (message.type === 'comparison/cancel') {
            this.cancel(message.channel);
            return;
        }
        const channel = channelFor(message);
        if (channel === 'comparison') {
            for (const name of ['files', 'commits', 'details', 'open'] satisfies ComparisonChannel[]) { this.cancel(name); }
        }
        if (message.type === 'comparison/commitsRequest' && !message.cursor) { this.cancel('details'); }
        this.cancel(channel);
        const controller = new AbortController();
        this.pending.set(channel, controller);
        try {
            const response = await this.response(message, controller.signal);
            if (!controller.signal.aborted && !this.disposed) { await this.webview.postMessage(response); }
        } catch (error) {
            if (!controller.signal.aborted && !isAbortError(error) && !this.disposed) {
                await this.webview.postMessage({ type: 'comparison/error', requestId: message.requestId, channel, error: serializeProtocolError(error, { operation: 'Branch comparison' }) });
            }
        } finally {
            if (this.pending.get(channel) === controller) { this.pending.delete(channel); }
        }
    }

    async checkStale(): Promise<void> {
        const snapshot = this.snapshot;
        if (!snapshot || this.stale || this.disposed || this.pending.has('comparison')) { return; }
        const controller = new AbortController();
        this.cancel('init');
        this.pending.set('init', controller);
        try {
            const branches = await this.repository.listBranches(controller.signal);
            const [base, head] = await Promise.all([
                this.repository.resolveRef(branchRef(branches, snapshot.baseBranch), controller.signal),
                this.repository.resolveRef(branchRef(branches, snapshot.headBranch), controller.signal),
            ]);
            if (base === snapshot.baseHash && head === snapshot.headHash) { return; }
        } catch (error) {
            if (controller.signal.aborted || isAbortError(error)) { return; }
            // A deleted or unavailable branch also invalidates its pinned comparison.
        } finally {
            if (this.pending.get('init') === controller) { this.pending.delete('init'); }
        }
        if (this.snapshot !== snapshot || controller.signal.aborted || this.disposed) { return; }
        this.stale = true;
        await this.webview.postMessage({ type: 'comparison/stale' });
    }

    dispose(): void {
        this.disposed = true;
        for (const controller of this.pending.values()) { controller.abort(); }
        this.pending.clear();
        this.details.clear();
    }

    private cancel(channel: ComparisonChannel): void {
        this.pending.get(channel)?.abort();
        this.pending.delete(channel);
    }

    private async response(message: Exclude<ComparisonRequest, { readonly type: 'comparison/cancel' }>, signal: AbortSignal): Promise<ComparisonResponse> {
        const requestId = message.requestId;
        switch (message.type) {
            case 'comparison/ready': {
                const branches = await this.repository.listBranches(signal);
                return { type: 'comparison/init', requestId, repositoryLabel: this.repository.label, baseBranch: this.initialBase, headBranch: this.initialHead, branches: branchPage(branches, '', undefined) };
            }
            case 'comparison/branchesRequest':
                return { type: 'comparison/branchesResponse', requestId, branches: branchPage(await this.repository.listBranches(signal), message.search, message.cursor) };
            case 'comparison/dataRequest': {
                if (!Object.values(ComparisonMode).includes(message.mode)) { throw new Error('Invalid comparison mode.'); }
                const branches = await this.repository.listBranches(signal);
                const data = await new GetBranchComparison().execute(this.repository, branchRef(branches, message.baseBranch), branchRef(branches, message.headBranch), message.mode === ComparisonMode.SinceDivergence, signal);
                signal.throwIfAborted();
                this.files.clear(); this.commits.clear(); this.details.clear();
                const snapshot: ComparisonSnapshot = { id: randomUUID(), baseBranch: message.baseBranch, headBranch: message.headBranch, mode: message.mode,
                    baseHash: data.baseHash, headHash: data.headHash, leftHash: data.leftHash,
                    files: filePage(data.files), commits: commitPage(data.commits, data.commitCount) };
                this.snapshot = snapshot; this.stale = false;
                this.rememberFiles(snapshot.files.items);
                for (const commit of snapshot.commits.items) { this.commits.add(commit.hash); }
                return { type: 'comparison/dataResponse', requestId, snapshot };
            }
            case 'comparison/filesRequest': {
                const snapshot = this.requireSnapshot(message.snapshotId);
                const page = await this.repository.listChangedFiles(snapshot.leftHash, snapshot.headHash, { limit: 100, encodedCursor: message.cursor, search: message.search }, signal);
                signal.throwIfAborted();
                const files = filePage(page); this.rememberFiles(files.items);
                return { type: 'comparison/filesResponse', requestId, search: message.search, files };
            }
            case 'comparison/commitsRequest': {
                const snapshot = this.requireSnapshot(message.snapshotId);
                const page = await new GetComparisonCommits().execute(this.repository, snapshot.baseHash, snapshot.headHash, message.search, { limit: 50, encodedCursor: message.cursor }, signal);
                signal.throwIfAborted();
                for (const commit of page.items) { this.commits.add(commit.hash); }
                return { type: 'comparison/commitsResponse', requestId, commits: commitPage(page, snapshot.commits.totalCount) };
            }
            case 'comparison/detailsRequest': {
                this.requireSnapshot(message.snapshotId);
                if (!this.commits.has(message.hash)) { throw new Error('Select a commit from this comparison.'); }
                let details = this.details.get(message.hash);
                if (!details) {
                    details = await new GetCommitDetailsUseCase().execute(this.repository, message.hash, signal);
                    signal.throwIfAborted();
                    this.details.set(message.hash, details);
                }
                const search = message.search.trim().toLowerCase();
                const files = search ? details.files.filter(file => file.filePath.toLowerCase().includes(search) || file.origPath?.toLowerCase().includes(search)) : details.files;
                return { type: 'comparison/detailsResponse', requestId, search: message.search, details: { hash: details.hash, fullMessage: details.fullMessage, files: arrayPage(files, message.cursor, 100) } };
            }
            case 'comparison/openDiff': {
                const snapshot = this.requireSnapshot(message.snapshotId);
                if (message.commitHash) {
                    const details = this.details.get(message.commitHash);
                    const file = details?.files.find(item => item.filePath === message.filePath && item.parentHash === message.parentHash);
                    if (!file || file.isSubmodule) { throw new Error('Select a regular file from the commit details.'); }
                    await openCommitFileDiff(this.repository, { ...file, commitHash: message.commitHash }, undefined, signal);
                } else {
                    const file = this.requireFile(message.filePath);
                    if (file.isSubmodule) { throw new Error('Submodule pointers cannot be opened as file diffs.'); }
                    await openCommitFileDiff(this.repository, { ...file, commitHash: snapshot.headHash, parentHash: snapshot.leftHash }, undefined, signal);
                }
                return { type: 'comparison/opened', requestId };
            }
        }
    }

    private requireSnapshot(id: string): ComparisonSnapshot {
        if (!this.snapshot || this.snapshot.id !== id) { throw new Error('This comparison has expired. Refresh it and try again.'); }
        return this.snapshot;
    }

    private requireFile(path: string): ComparisonFile {
        const file = this.files.get(path);
        if (!file) { throw new Error('Select a file from this comparison.'); }
        return file;
    }

    private rememberFiles(files: readonly ComparisonFile[]): void { for (const file of files) { this.files.set(file.filePath, file); } }

}

function branchRef(branches: readonly GitBranch[], name: string): string {
    if (name === 'HEAD') { return 'HEAD'; }
    const branch = branches.find(item => (item.isRemote ? 'refs/remotes/' : 'refs/heads/') + item.name === name)
        ?? branches.find(item => item.name === name);
    if (!branch) { throw new Error(`Branch "${name}" was not found.`); }
    return (branch.isRemote ? 'refs/remotes/' : 'refs/heads/') + branch.name;
}

function branchPage(branches: readonly GitBranch[], search: string, cursor: string | undefined): ComparisonPage<ComparisonBranch> {
    const filtered = branches.filter(branch => branch.name.toLowerCase().includes(search.trim().toLowerCase()));
    return arrayPage(filtered.map(branch => ({ name: branch.name, ref: (branch.isRemote ? 'refs/remotes/' : 'refs/heads/') + branch.name, isRemote: branch.isRemote })), cursor, 100);
}

function arrayPage<T>(items: readonly T[], cursor: string | undefined, limit: number): ComparisonPage<T> {
    const offset = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) { throw new Error('Invalid page cursor.'); }
    const hasMore = items.length > offset + limit;
    return { items: items.slice(offset, offset + limit), hasMore, cursor: hasMore ? String(offset + limit) : undefined, totalCount: items.length };
}

function filePage(page: ChangedFilesPage) {
    return { items: page.items, hasMore: page.hasMore, cursor: page.encodedNextCursor, totalCount: page.totalCount, matchingCount: page.matchingCount, additions: page.additions, deletions: page.deletions };
}

function commitPage(page: Page<GitCommit>, totalCount: number): ComparisonPage<ComparisonCommit> {
    return {
        items: page.items.map(commit => ({ hash: commit.hash, shortHash: commit.shortHash, message: commit.message, authorName: commit.authorName, authorDate: commit.authorDate })),
        hasMore: page.hasMore,
        cursor: page.encodedNextCursor,
        totalCount,
    };
}

function channelFor(message: Exclude<ComparisonRequest, { readonly type: 'comparison/cancel' }>): ComparisonChannel {
    switch (message.type) {
        case 'comparison/ready': return 'init';
        case 'comparison/dataRequest': return 'comparison';
        case 'comparison/branchesRequest': return 'branches';
        case 'comparison/filesRequest': return 'files';
        case 'comparison/commitsRequest': return 'commits';
        case 'comparison/detailsRequest': return 'details';
        case 'comparison/openDiff': return 'open';
    }
}
