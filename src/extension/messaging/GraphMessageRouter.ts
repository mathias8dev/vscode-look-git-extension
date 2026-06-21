import * as vscode from 'vscode';
import * as path from 'path';
import {
    GraphOperationCategory,
    GraphOperationStatus,
    type GraphWebviewToExtensionMessage,
    type GraphExtensionToWebviewMessage,
    type GraphDataResponse,
    type CommitDetailsResponse,
    type WorktreeDetailsResponse,
    type OpenWorktreeDiffRequest,
    type GraphOperationStatusPush,
} from '@protocol/graph/messages';
import type { GraphData, GraphFilters, GraphSubmoduleInfo } from '@protocol/graph/types';
import type { ErrorCode, RequestId } from '@protocol/shared/base';
import type { RepositoryLocator, WorktreeLocator } from '@protocol/shared/repo';
import type { GitStatus } from '@core/git/domain/GitStatus';
import type { GitRepository } from '@application/ports/git-topology';
import { GetGraphDataUseCase, type GraphDataResult } from '@application/usecases/graph/get-graph-data';
import { GetCommitDetailsUseCase } from '@application/usecases/graph/get-commit-details';
import { GetWorktreeDetailsUseCase } from '@application/usecases/graph/get-worktree-details';
import type { ActiveRepositoryAccessor } from '@extension/repositories/ActiveRepositoryRegistry';
import { toProtocolBranch, toProtocolGraphCommit, toProtocolGraphSubmodule, toProtocolWorktree } from '@extension/mapping/toProtocol';
import { runCommitCommand } from '@extension/commands/commit-commands';
import { runBranchCommand } from '@extension/commands/branch-commands';
import { runWorktreeCommand } from '@extension/commands/worktree-commands';
import { requireRuntimeRepository, requireRuntimeWorktree, type RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';
import { operationActionsForStatus } from '@extension/utils/operation-feedback';
import { openCommitGitlinkDiff, openWorktreeGitlinkDiff } from '@extension/utils/gitlink-diff';
import { emptyDiffUri } from '@extension/utils/diff-uris';
import { gitBlobUri } from '@extension/utils/git-blob-documents';
import { createErrorPayload, isAbortError } from '@extension/messaging/errorSerialization';
import { appendErrorToOutput, showErrorOutput } from '@extension/messaging/errorOutputChannel';
import type { RepositoryRegistry } from '@extension/repositories/RepositoryRegistry';
import { requireRuntimeLocator } from '@extension/repositories/runtime-repository-locator';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;

interface BranchFilterInvalidation {
    readonly branch: string;
    readonly repository?: RepositoryLocator;
}

export class GraphMessageRouter {
    private readonly pending = new Map<string, AbortController>();
    private operationSequence = 0;

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
        private readonly getGraphData = new GetGraphDataUseCase(),
        private readonly getCommitDetails = new GetCommitDetailsUseCase(),
        private readonly getWorktreeDetails = new GetWorktreeDetailsUseCase(),
        private readonly extensionUri?: vscode.Uri,
        private readonly runtimeRepositories?: RepositoryRegistry,
    ) {}

    dispose(): void {
        for (const ctrl of this.pending.values()) { ctrl.abort(); }
        this.pending.clear();
    }

    async handle(msg: GraphWebviewToExtensionMessage): Promise<void> {
        const operation = graphOperationForMessage(msg);
        const operationId = operation ? this.nextOperationId() : undefined;
        if (operation && operationId) {
            this.postGraphOperation({ ...operation, operationId, status: GraphOperationStatus.Running });
        }
        let existingConflicts: ReadonlySet<string> | undefined;

        try {
            existingConflicts = await this.conflictFilesBeforeOperation(msg);
            await this.dispatch(msg);
            if (operation && operationId) {
                this.postGraphOperation({ ...operation, operationId, status: GraphOperationStatus.Success });
            }
        } catch (error) {
            if (isAbortError(error)) { return; }
            if (operation && operationId) {
                if (await this.detectOperationConflicts(msg, existingConflicts, error)) {
                    this.postGraphOperation({ ...operation, operationId, status: GraphOperationStatus.Conflict });
                    await this.refreshAfterError();
                    return;
                }
                this.postGraphOperation({ ...operation, operationId, status: GraphOperationStatus.Failed });
            }
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

    private async conflictFilesBeforeOperation(msg: GraphWebviewToExtensionMessage): Promise<ReadonlySet<string> | undefined> {
        if (!shouldRefreshAfterFailedRepositoryMutation(msg)) { return undefined; }
        const worktree = requireRuntimeWorktree(this.runtimeTargetsForRepository(repositoryOf(msg)));
        return conflictFileSet(await worktree.getStatus());
    }

    private async detectOperationConflicts(
        msg: GraphWebviewToExtensionMessage,
        existingConflicts: ReadonlySet<string> | undefined,
        error: unknown,
    ): Promise<boolean> {
        if (!existingConflicts) { return false; }
        try {
            const worktree = requireRuntimeWorktree(this.runtimeTargetsForRepository(repositoryOf(msg)));
            const status = await worktree.getStatus();
            if (!hasNewConflicts(conflictFileSet(status), existingConflicts)) { return false; }
            const payload = createErrorPayload(error, {
                code: errorCodeFor(msg),
                operation: msg.type,
                recoverable: true,
            });
            appendErrorToOutput(payload.error, 'graph');
            return true;
        } catch {
            return false;
        }
    }

    private async dispatch(msg: GraphWebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'graph/ready':
                break;

            case 'graph/refresh':
                this.requestGraphRefresh();
                break;

            case 'graph/showOutput':
                showErrorOutput();
                break;

            case 'graph/dataRequest': {
                const repoId = this.repoIdForRequest(msg.repoId);
                const key = graphRequestKey(repoId, msg.repository, 'replace');
                this.abortPendingGraphSubmodules(repoId, msg.repository);
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal, msg.repository, false);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                    this.requestGraphSubmoduleHydration(repoId, msg.repository, data);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/loadMore': {
                const repoId = this.repoIdForRequest(msg.repoId);
                const key = graphRequestKey(repoId, msg.repository, 'more');
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal, msg.repository, false);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/commitDetailsRequest': {
                const runtimeRepo = this.runtimeTargetsForRepository(msg.repository).repository;
                if (!runtimeRepo) { throw new Error('No runtime repository available.'); }
                const details = await this.getCommitDetails.execute(runtimeRepo, msg.hash);
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
                const runtimeWorktree = this.runtimeTargetsForWorktree(msg.repository, msg.worktree, msg.path).worktree;
                if (!runtimeWorktree) { throw new Error('No runtime worktree available.'); }
                const details = await this.getWorktreeDetails.execute(runtimeWorktree);
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
                await this.handleRepositoryCommand(msg);
                break;

            case 'graph/branchCommand':
                await this.handleBranchCommand(msg);
                break;

            case 'graph/worktreeCommand':
                await this.handleWorktreeCommand(msg);
                break;

            case 'graph/commitCommand':
                await this.handleCommitCommand(msg);
                break;

            case 'graph/openDiff': {
                if (msg.isSubmodule) {
                    await openCommitGitlinkDiff(this.requireRuntimeRepositoryForRequest(msg.repository), msg);
                    break;
                }
                const { left, right } = await createCommitFileDiffUris(msg, this.requireRuntimeRepositoryForRequest(msg.repository));
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${msg.commitHash.substring(0, 7)})`);
                break;
            }

            case 'graph/openWorktreeDiff': {
                if (msg.isSubmodule) {
                    await openWorktreeGitlinkDiff(requireRuntimeWorktree(this.runtimeTargetsForWorktree(msg.repository, msg.worktree, msg.worktreePath)), msg);
                    break;
                }
                const { left, right } = await createWorktreeDiffUris(msg, this.runtimeTargetsForWorktree(msg.repository, msg.worktree, msg.worktreePath));
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${path.basename(msg.worktreePath)})`);
                break;
            }

            default:
                break;
        }
    }

    async pushGraphData(filters: GraphFilters | undefined, signal: AbortSignal | undefined): Promise<void> {
        try {
            const context = this.repositories.currentContext;
            if (!context) {
                this.postMessage({ type: 'graph/dataPush', repoId: '', data: emptyGraphData() });
                return;
            }
            const data = await this.buildGraphData(filters ?? {}, 0, 300, signal, undefined, false);
            this.postMessage({ type: 'graph/dataPush', repoId: context.id, data });
            this.requestGraphSubmoduleHydration(context.id, undefined, data);
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
        repository?: RepositoryLocator,
        includeSubmoduleRepositories = true,
    ): Promise<GraphData> {
        const runtimeRepo = this.requireRuntimeRepositoryForRequest(repository);
        const result = await this.getGraphData.execute(runtimeRepo, filters, { offset, limit }, signal, { includeSubmoduleRepositories });
        for (const warning of result.warnings) {
            this.postGraphError(warning.error, {
                operation: warning.operation,
                code: 'optionalDataUnavailable',
            });
        }
        return toProtocolGraphData(result, repositoryLocatorForRuntimeRepository(runtimeRepo));
    }

    private repoIdForRequest(repoId: string | undefined): string {
        return repoId ?? this.repositories.currentContext?.id ?? '';
    }

    private abortPendingGraphSubmodules(repoId: string, repository: RepositoryLocator | undefined): void {
        this.pending.get(graphRequestKey(repoId, repository, 'submodules'))?.abort();
    }

    private requestGraphSubmoduleHydration(repoId: string, repository: RepositoryLocator | undefined, data: GraphData): void {
        if (data.submodules.length === 0) { return; }

        const targetRepository = repository ?? data.repository;
        const key = graphRequestKey(repoId, targetRepository, 'submodules');
        this.pending.get(key)?.abort();
        const ctrl = new AbortController();
        this.pending.set(key, ctrl);

        void this.buildGraphSubmodules(targetRepository, ctrl.signal)
            .then((submodules) => {
                if (this.pending.get(key) !== ctrl || submodules.length === 0) { return; }
                this.postMessage({
                    type: 'graph/submodulesPush',
                    repoId,
                    ...repositoryMessageProperty(targetRepository),
                    submodules,
                });
            })
            .catch((error: unknown) => {
                if (isAbortError(error)) { return; }
                this.postGraphError(error, {
                    operation: 'graph/submodulesHydration',
                    code: 'optionalDataUnavailable',
                });
            })
            .finally(() => {
                if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
            });
    }

    private async buildGraphSubmodules(repository: RepositoryLocator | undefined, signal?: AbortSignal): Promise<readonly GraphSubmoduleInfo[]> {
        const runtimeRepo = this.requireRuntimeRepositoryForRequest(repository);
        const submoduleStatuses = await runtimeRepo.listSubmodules(signal);
        return Promise.all(submoduleStatuses.map(async (submodule) => {
            const submoduleRepository = submoduleRepositoryLocator(runtimeRepo, submodule.path, submodule.status);
            if (!submoduleRepository || !this.runtimeRepositories) {
                return toProtocolGraphSubmodule({ path: submodule.path, status: submodule.status, branches: [], worktrees: [] }, submoduleRepository);
            }
            try {
                const childRepository = this.runtimeRepositories.resolveRepository(submoduleRepository);
                const [branches, worktrees] = await Promise.all([
                    childRepository.listBranches(signal),
                    childRepository.listWorktrees(signal),
                ]);
                return toProtocolGraphSubmodule({ path: submodule.path, status: submodule.status, branches, worktrees }, submoduleRepository);
            } catch (error) {
                this.postGraphError(error, {
                    operation: `graph/submoduleRepository:${submodule.path}`,
                    code: 'optionalDataUnavailable',
                });
                return toProtocolGraphSubmodule({ path: submodule.path, status: submodule.status, branches: [], worktrees: [] }, submoduleRepository);
            }
        }));
    }

    private requireRuntimeRepositoryForRequest(repository: RepositoryLocator | undefined): GitRepository {
        const targets = this.runtimeTargetsForRepository(repository);
        if (!targets.repository) { throw new Error('Runtime repository is not available.'); }
        return targets.repository;
    }

    private async handleRepositoryCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/repositoryCommand' }>): Promise<void> {
        const runtimeRepo = this.requireRuntimeRepositoryForRequest(msg.repository);
        switch (msg.command) {
            case 'fetch':
                await runtimeRepo.fetchAll({});
                break;
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleBranchCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/branchCommand' }>): Promise<void> {
        const runtimeTargets = this.runtimeTargetsForRepository(msg.repository);
        const repo = requireRuntimeRepository(runtimeTargets);
        const shouldRefresh = await runBranchCommand(repo, msg.command, msg.branch, msg.isRemote, undefined, runtimeTargets);
        if (!shouldRefresh) { return; }
        // `delete` removes the branch and `rename` frees its old name; if the graph is
        // filtered to that branch, the next reload would query a now-missing ref, so the
        // webview has to drop the filter first.
        const invalidatesBranchFilter = msg.command === 'delete' || msg.command === 'rename';
        await this.refreshAfterRepositoryChange(invalidatesBranchFilter
            ? { branch: msg.branch, repository: msg.repository }
            : undefined);
    }

    private async handleWorktreeCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/worktreeCommand' }>): Promise<void> {
        const runtimeTargets = msg.path
            ? this.runtimeTargetsForWorktree(msg.repository, msg.worktree, msg.path)
            : this.runtimeTargetsForRepository(msg.repository);
        const repo = requireRuntimeRepository(runtimeTargets);
        const shouldRefresh = await runWorktreeCommand(repo, msg.command, msg.path, runtimeTargets);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private async handleCommitCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/commitCommand' }>): Promise<void> {
        const runtimeTargets = this.runtimeTargetsForRepository(msg.repository);
        const shouldRefresh = await runCommitCommand(requireRuntimeRepository(runtimeTargets), msg.command, msg.hash, msg.hashes, undefined, undefined, undefined, diffExplanationScopeFor(msg.repository), this.extensionUri, undefined, runtimeTargets);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private runtimeTargetsForRepository(repository: RepositoryLocator | undefined): RuntimeCommandTargets {
        if (repository && this.runtimeRepositories) {
            try {
                const runtimeRepository = this.runtimeRepositories.resolveRepository(repository);
                const worktrees = this.runtimeRepositories.worktrees(runtimeRepository.repoId);
                const worktree = worktrees.find((candidate) => candidate.isMain) ?? worktrees[0];
                return {
                    repository: runtimeRepository,
                    ...(worktree ? { worktree } : {}),
                    worktrees,
                };
            } catch {
                return {};
            }
        }
        try {
            return requireRuntimeLocator(this.runtimeRepositories, this.repositories.currentContext).targets();
        } catch {
            return {};
        }
    }

    private runtimeTargetsForWorktree(
        repository: RepositoryLocator | undefined,
        worktree: WorktreeLocator | undefined,
        worktreePath: string,
    ): RuntimeCommandTargets {
        if (repository && this.runtimeRepositories) {
            try {
                const runtimeRepository = this.runtimeRepositories.resolveRepository(repository);
                const worktrees = this.runtimeRepositories.worktrees(runtimeRepository.repoId);
                const resolvedWorktree = worktree
                    ? this.runtimeRepositories.resolveWorktree(worktree)
                    : worktrees.find((candidate) => samePath(candidate.path, worktreePath));
                return {
                    repository: runtimeRepository,
                    ...(resolvedWorktree ? { worktree: resolvedWorktree } : {}),
                    worktrees,
                };
            } catch {
                return {};
            }
        }
        try {
            return requireRuntimeLocator(this.runtimeRepositories, this.repositories.currentContext).targetsForWorktreePath(worktreePath);
        } catch {
            return {};
        }
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
        appendErrorToOutput(payload.error, 'graph');
        this.postMessage({
            type: 'graph/error',
            requestId: options.requestId,
            ...payload,
        });
        if (options.notifyUser) {
            void vscode.window.showErrorMessage(payload.message);
        }
    }

    private postGraphOperation(operation: Omit<GraphOperationStatusPush, 'type'>): void {
        this.postMessage({
            type: 'graph/operationStatus',
            ...operation,
            actions: operation.actions ?? operationActionsForStatus(operation.status),
        });
    }

    private nextOperationId(): string {
        this.operationSequence += 1;
        return `graph-op-${this.operationSequence}`;
    }

    private async refreshAfterRepositoryChange(invalidatedBranchFilter?: BranchFilterInvalidation): Promise<void> {
        if (invalidatedBranchFilter) {
            this.postMessage({
                type: 'graph/branchFilterInvalidated',
                branch: invalidatedBranchFilter.branch,
                ...repositoryMessageProperty(invalidatedBranchFilter.repository),
            });
        } else {
            this.requestGraphRefresh();
        }
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

type GraphOperationDescriptor = Omit<GraphOperationStatusPush, 'type' | 'operationId' | 'status'>;

function toProtocolGraphData(result: GraphDataResult, repository: RepositoryLocator): GraphData {
    const currentBranchCommits = new Set(result.currentBranchCommitHashes);
    return {
        repository,
        branches: result.branches.map(toProtocolBranch),
        tags: result.tags.map((tag) => ({ name: tag.name, hash: tag.hash })),
        commits: result.commits.map((commit) => ({
            ...toProtocolGraphCommit(commit),
            canCherryPick: !currentBranchCommits.has(commit.hash),
        })),
        currentBranch: result.currentBranch,
        currentUser: result.currentUser,
        hasMore: result.hasMore,
        loadedCount: result.loadedCount,
        totalCount: result.totalCount,
        hasRemotes: result.hasRemotes,
        worktrees: result.worktrees.map((worktree) => toProtocolWorktree(worktree, repository.repoId)),
        worktreeWips: result.worktreeWips,
        submodules: result.submodules.map((submodule) => toProtocolGraphSubmodule(
            submodule,
            submoduleRepositoryLocator(repository, submodule.path, submodule.status),
        )),
    };
}

function graphRequestKey(repoId: string, repository: RepositoryLocator | undefined, kind: 'replace' | 'more' | 'submodules'): string {
    return `${repoId}:${repository?.repoId ?? 'active'}:${kind}`;
}

function requestIdOf(msg: GraphWebviewToExtensionMessage): RequestId | undefined {
    return 'requestId' in msg ? msg.requestId : undefined;
}

function repositoryOf(msg: GraphWebviewToExtensionMessage): RepositoryLocator | undefined {
    return 'repository' in msg ? msg.repository : undefined;
}

function repositoryMessageProperty(repository: RepositoryLocator | undefined): { readonly repository: RepositoryLocator } | Record<string, never> {
    return repository ? { repository } : {};
}

function repositoryLocatorForRuntimeRepository(repository: GitRepository): RepositoryLocator {
    return {
        repoId: repository.repoId,
        kind: repository.kind,
        path: repository.cwd,
        ...(repository.parentRepositoryId ? { parentRepoId: repository.parentRepositoryId } : {}),
    };
}

function submoduleRepositoryLocator(parent: GitRepository | RepositoryLocator, submodulePath: string, status: string): RepositoryLocator | undefined {
    if (status === '-') { return undefined; }
    const parentPath = 'cwd' in parent ? parent.cwd : parent.path;
    const submoduleCwd = path.resolve(parentPath, submodulePath);
    return {
        repoId: stableRepoContextId(submoduleCwd),
        kind: 'submodule',
        path: submoduleCwd,
        parentRepoId: parent.repoId,
    };
}

function samePath(left: string, right: string): boolean {
    return path.normalize(left) === path.normalize(right);
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

function conflictFileSet(status: GitStatus): ReadonlySet<string> {
    return new Set(status.conflicts.map((entry) => entry.filePath));
}

function hasNewConflicts(current: ReadonlySet<string>, previous: ReadonlySet<string>): boolean {
    for (const filePath of current) {
        if (!previous.has(filePath)) { return true; }
    }
    return false;
}

function graphOperationForMessage(msg: GraphWebviewToExtensionMessage): GraphOperationDescriptor | undefined {
    switch (msg.type) {
        case 'graph/repositoryCommand':
            return {
                category: GraphOperationCategory.Repository,
                command: msg.command,
                ...repositoryMessageProperty(msg.repository),
            };
        case 'graph/branchCommand':
            return graphBranchOperation(msg);
        case 'graph/worktreeCommand':
            return graphWorktreeOperation(msg);
        case 'graph/commitCommand':
            return graphCommitOperation(msg);
        default:
            return undefined;
    }
}

function graphBranchOperation(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/branchCommand' }>): GraphOperationDescriptor | undefined {
    switch (msg.command) {
        case 'checkout':
        case 'checkoutRebaseOnto':
        case 'push':
        case 'update':
        case 'rebaseOnto':
        case 'mergeInto':
        case 'pullBranchWorktree':
        case 'pushBranchWorktree':
        case 'lockBranchWorktree':
        case 'unlockBranchWorktree':
            return {
                category: GraphOperationCategory.Branch,
                command: msg.command,
                target: msg.branch,
                background: msg.command === 'push'
                    || msg.command === 'pullBranchWorktree'
                    || msg.command === 'pushBranchWorktree',
                ...repositoryMessageProperty(msg.repository),
            };
        case 'newBranchFrom':
        case 'newWorktreeFromBranch':
        case 'delete':
        case 'rename':
        case 'removeBranchWorktree':
        case 'openBranchWorktree':
        case 'revealBranchWorktree':
        case 'compareWithCurrent':
        case 'showDiffWithWorkingTree':
        case 'compareBranchWithWorktree':
        case 'showDiffWithBranchWorktree':
            return undefined;
    }
}

function graphWorktreeOperation(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/worktreeCommand' }>): GraphOperationDescriptor | undefined {
    switch (msg.command) {
        case 'fetch':
        case 'pull':
        case 'push':
        case 'lock':
        case 'unlock':
            return {
                category: GraphOperationCategory.Worktree,
                command: msg.command,
                target: msg.path,
                background: msg.command === 'fetch' || msg.command === 'pull' || msg.command === 'push',
                ...repositoryMessageProperty(msg.repository),
            };
        case 'commit':
        case 'stash':
        case 'newBranch':
        case 'checkoutBranch':
        case 'add':
        case 'remove':
        case 'removeForce':
        case 'open':
        case 'openInNewWindow':
        case 'reveal':
        case 'showDiffWithHead':
        case 'showDiffWithMainWorktree':
            return undefined;
    }
}

function graphCommitOperation(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/commitCommand' }>): GraphOperationDescriptor | undefined {
    switch (msg.command) {
        case 'cherryPick':
        case 'checkoutRevision':
        case 'revertCommit':
        case 'fixup':
            return {
                category: GraphOperationCategory.Commit,
                command: msg.command,
                target: msg.hash,
                ...repositoryMessageProperty(msg.repository),
            };
        case 'resetCurrentBranchToHere':
        case 'undoCommit':
        case 'editCommitMessage':
        case 'squashInto':
        case 'dropCommit':
        case 'pushAllUpToHere':
        case 'newBranch':
        case 'newTag':
        case 'newWorktreeFromCommit':
        case 'copyRevisionNumber':
        case 'createPatch':
        case 'explainDiff':
        case 'showRepositoryAtRevision':
        case 'compareWithLocal':
        case 'compareCommitWithWorktree':
            return undefined;
    }
}

function diffExplanationScopeFor(repository: RepositoryLocator | undefined): { readonly label: string; readonly value: string } | undefined {
    if (repository?.kind !== 'submodule') { return undefined; }
    return { label: 'Submodule', value: repository.path };
}

async function createCommitFileDiffUris(
    file: {
        readonly commitHash: string;
        readonly filePath: string;
        readonly origPath?: string;
        readonly parentHash?: string;
        readonly status: string;
    },
    repository: GitRepository,
): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const parentRef = file.parentHash ?? `${file.commitHash}~1`;
    const status = file.status.charAt(0);
    const origPath = file.origPath ?? file.filePath;

    if (status === 'A') {
        return {
            left: emptyDiffUri(file.commitHash, file.filePath, 'parent'),
            right: await commitBlobUri(repository, file.commitHash, file.filePath, 'commit'),
        };
    }

    if (status === 'D') {
        return {
            left: await commitBlobUri(repository, parentRef, origPath, 'parent'),
            right: emptyDiffUri(file.commitHash, file.filePath, 'commit'),
        };
    }

    return {
        left: await commitBlobUri(repository, parentRef, origPath, 'parent'),
        right: await commitBlobUri(repository, file.commitHash, file.filePath, 'commit'),
    };
}

async function commitBlobUri(repository: GitRepository, ref: string, filePath: string, side: string): Promise<vscode.Uri> {
    const content = await repository.getFileAtRevision(filePath, ref);
    return gitBlobUri(ref, filePath, side, content);
}

async function createWorktreeDiffUris(
    msg: OpenWorktreeDiffRequest,
    runtimeTargets: RuntimeCommandTargets,
): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const fileUri = vscode.Uri.file(path.join(msg.worktreePath, msg.filePath));
    const origPath = msg.origPath ?? msg.filePath;
    const status = msg.status.charAt(0);

    if (status === '?' || status === 'A') {
        return {
            left: emptyDiffUri('worktree', msg.filePath, 'head'),
            right: fileUri,
        };
    }

    if (status === 'D') {
        return {
            left: await worktreeHeadBlobUri(origPath, runtimeTargets),
            right: emptyDiffUri('worktree', msg.filePath, 'working-tree'),
        };
    }

    return {
        left: await worktreeHeadBlobUri(origPath, runtimeTargets),
        right: fileUri,
    };
}

async function worktreeHeadBlobUri(
    filePath: string,
    runtimeTargets: RuntimeCommandTargets,
): Promise<vscode.Uri> {
    const content = await requireRuntimeWorktree(runtimeTargets).getFileAtRevision(filePath, 'HEAD');
    return gitBlobUri('worktree-head', filePath, 'head', content);
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
        submodules: [],
    };
}
