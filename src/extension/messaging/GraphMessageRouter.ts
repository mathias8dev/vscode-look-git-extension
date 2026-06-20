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
} from '../../protocol/graph/messages';
import type { GraphData, GraphFilters, GraphRepositoryScope, GraphSubmoduleInfo } from '../../protocol/graph/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { GitRepository as LegacyGitRepository } from '../../application/ports/git-repository';
import type { GitRepository, Worktree } from '../../application/ports/git-topology';
import { GetGraphDataUseCase, type GraphDataResult } from '../../application/usecases/graph/get-graph-data';
import { GetCommitDetailsUseCase } from '../../application/usecases/graph/get-commit-details';
import { GetWorktreeDetailsUseCase } from '../../application/usecases/graph/get-worktree-details';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { toProtocolBranch, toProtocolGraphCommit, toProtocolGraphSubmodule, toProtocolWorktree, toRepositoryLocator, toWorktreeLocator } from '../mapping/toProtocol';
import { ScopedGitRepository } from '../git/scoped-git-repository';
import { stableRepoContextId } from '../repositories/repo-context-id';
import { runCommitCommand } from '../commands/commit-commands';
import { runBranchCommand } from '../commands/branch-commands';
import { runWorktreeCommand } from '../commands/worktree-commands';
import { requireRuntimeWorktree, type RuntimeCommandTargets } from '../commands/runtime-command-targets';
import { operationActionsForStatus } from '../utils/operation-feedback';
import { openCommitGitlinkDiff, openWorktreeGitlinkDiff } from '../utils/gitlink-diff';
import { commitFileDiffUris, emptyDiffUri } from '../utils/diff-uris';
import { gitBlobUri } from '../utils/git-blob-documents';
import { createErrorPayload, isAbortError } from './errorSerialization';
import { appendErrorToOutput, showErrorOutput } from './errorOutputChannel';
import { openVisualRebasePanel } from '../utils/visual-rebase-panel';
import type { RepositoryRegistry } from '../repositories/RepositoryRegistry';

type PostMessage = (msg: GraphExtensionToWebviewMessage) => void;

interface BranchFilterInvalidation {
    readonly branch: string;
    readonly repositoryScope?: GraphRepositoryScope;
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
        private readonly storageUri?: vscode.Uri,
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
        const repo = await this.repositoryForScope(repositoryScopeOf(msg));
        return conflictFileSet(await repo.getStatus());
    }

    private async detectOperationConflicts(
        msg: GraphWebviewToExtensionMessage,
        existingConflicts: ReadonlySet<string> | undefined,
        error: unknown,
    ): Promise<boolean> {
        if (!existingConflicts) { return false; }
        try {
            const repo = await this.repositoryForScope(repositoryScopeOf(msg));
            const status = await repo.getStatus();
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
                const key = graphRequestKey(msg.repoId, msg.repositoryScope, 'replace');
                this.abortPendingGraphSubmodules(msg.repoId, msg.repositoryScope);
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal, msg.repositoryScope, false);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                    this.requestGraphSubmoduleHydration(msg.repoId, msg.repositoryScope, data);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/loadMore': {
                const key = graphRequestKey(msg.repoId, msg.repositoryScope, 'more');
                this.pending.get(key)?.abort();
                const ctrl = new AbortController();
                this.pending.set(key, ctrl);
                try {
                    const data = await this.buildGraphData(msg.filters, msg.page.offset, msg.page.limit, ctrl.signal, msg.repositoryScope, false);
                    const response: GraphDataResponse = { type: 'graph/dataResponse', requestId: msg.requestId, data };
                    this.postMessage(response);
                } finally {
                    if (this.pending.get(key) === ctrl) { this.pending.delete(key); }
                }
                break;
            }

            case 'graph/commitDetailsRequest': {
                const runtimeRepo = this.runtimeTargetsForScope(msg.repositoryScope).repository;
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
                const runtimeWorktree = this.runtimeTargetsForWorktreePath(msg.repositoryScope, msg.path).worktree;
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
                const repo = await this.repositoryForScope(msg.repositoryScope);
                if (msg.isSubmodule) {
                    await openCommitGitlinkDiff(repo, msg);
                    break;
                }
                const { left, right } = await commitFileDiffUris(repo.cwd, msg);
                await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(msg.filePath)} (${msg.commitHash.substring(0, 7)})`);
                break;
            }

            case 'graph/openWorktreeDiff': {
                if (msg.isSubmodule) {
                    const repo = await this.repositoryForScope(msg.repositoryScope);
                    await openWorktreeGitlinkDiff(repo, msg);
                    break;
                }
                const { left, right } = await createWorktreeDiffUris(msg, this.runtimeTargetsForWorktreePath(msg.repositoryScope, msg.worktreePath));
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
            const data = await this.buildGraphData(filters ?? {}, 0, 300, signal, undefined, false);
            this.postMessage({ type: 'graph/dataPush', repoId: repo.cwd, data });
            this.requestGraphSubmoduleHydration(repo.cwd, undefined, data);
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
        scope?: GraphRepositoryScope,
        includeSubmoduleRepositories = true,
    ): Promise<GraphData> {
        const runtimeRepo = this.requireRuntimeRepositoryForScope(scope);
        const result = await this.getGraphData.execute(runtimeRepo, filters, { offset, limit }, signal, { includeSubmoduleRepositories });
        for (const warning of result.warnings) {
            this.postGraphError(warning.error, {
                operation: warning.operation,
                code: 'optionalDataUnavailable',
            });
        }
        return toProtocolGraphData(result, normalizedScope(scope));
    }

    private abortPendingGraphSubmodules(repoId: string, scope: GraphRepositoryScope | undefined): void {
        this.pending.get(graphRequestKey(repoId, scope, 'submodules'))?.abort();
    }

    private requestGraphSubmoduleHydration(repoId: string, scope: GraphRepositoryScope | undefined, data: GraphData): void {
        if (data.submodules.length === 0) { return; }

        const repositoryScope = normalizedScope(scope);
        const key = graphRequestKey(repoId, repositoryScope, 'submodules');
        this.pending.get(key)?.abort();
        const ctrl = new AbortController();
        this.pending.set(key, ctrl);

        void this.buildGraphSubmodules(repositoryScope, ctrl.signal)
            .then((submodules) => {
                if (this.pending.get(key) !== ctrl || submodules.length === 0) { return; }
                this.postMessage({
                    type: 'graph/submodulesPush',
                    repoId,
                    repositoryScope,
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

    private async buildGraphSubmodules(scope: GraphRepositoryScope, signal?: AbortSignal): Promise<readonly GraphSubmoduleInfo[]> {
        const runtimeRepo = this.requireRuntimeRepositoryForScope(scope);
        const submoduleStatuses = await runtimeRepo.listSubmodules(signal);
        const result = await this.getGraphData.getSubmoduleRepositories(runtimeRepo, submoduleStatuses, signal);
        for (const warning of result.warnings) {
            this.postGraphError(warning.error, {
                operation: warning.operation,
                code: 'optionalDataUnavailable',
            });
        }
        return result.submodules.map(toProtocolGraphSubmodule);
    }

    private requireRuntimeRepositoryForScope(scope: GraphRepositoryScope | undefined): GitRepository {
        const targets = this.runtimeTargetsForScope(scope);
        if (!targets.repository) { throw new Error('Runtime repository is not available.'); }
        return targets.repository;
    }

    private async repositoryForScope(scope: GraphRepositoryScope | undefined, signal?: AbortSignal): Promise<LegacyGitRepository> {
        const repo = this.repositories.requireRepository();
        const submodulePath = submodulePathForScope(scope);
        if (!submodulePath) { return repo; }
        const submodules = await repo.getSubmoduleStatus(signal);
        if (!submodules.some((submodule) => submodule.path === submodulePath)) {
            throw new Error(`Unknown submodule: ${submodulePath}`);
        }
        return new ScopedGitRepository(repo, submodulePath);
    }

    private async handleRepositoryCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/repositoryCommand' }>): Promise<void> {
        const runtimeRepo = this.requireRuntimeRepositoryForScope(msg.repositoryScope);
        switch (msg.command) {
            case 'fetch':
                await runtimeRepo.fetchAll({});
                break;
        }
        await this.refreshAfterRepositoryChange();
    }

    private async handleBranchCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/branchCommand' }>): Promise<void> {
        const repo = await this.repositoryForScope(msg.repositoryScope);
        if (msg.command === 'planInteractiveRebaseOnto') {
            if (!this.extensionUri) { throw new Error('Visual Rebase requires the extension URI.'); }
            if (!this.storageUri) { throw new Error('Visual Rebase requires extension storage.'); }
            await openVisualRebasePanel(repo, this.extensionUri, this.storageUri, {
                upstream: msg.branch,
                onto: msg.branch,
                title: `Visual Rebase onto ${msg.branch}`,
            });
            return;
        }
        const shouldRefresh = await runBranchCommand(repo, msg.command, msg.branch, msg.isRemote, undefined, this.runtimeTargetsForScope(msg.repositoryScope));
        if (!shouldRefresh) { return; }
        // `delete` removes the branch and `rename` frees its old name; if the graph is
        // filtered to that branch, the next reload would query a now-missing ref, so the
        // webview has to drop the filter first.
        const invalidatesBranchFilter = msg.command === 'delete' || msg.command === 'rename';
        await this.refreshAfterRepositoryChange(invalidatesBranchFilter
            ? { branch: msg.branch, repositoryScope: msg.repositoryScope }
            : undefined);
    }

    private async handleWorktreeCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/worktreeCommand' }>): Promise<void> {
        const repo = await this.repositoryForScope(msg.repositoryScope);
        const runtimeTargets = msg.path
            ? this.runtimeTargetsForWorktreePath(msg.repositoryScope, msg.path)
            : this.runtimeTargetsForScope(msg.repositoryScope);
        const shouldRefresh = await runWorktreeCommand(repo, msg.command, msg.path, runtimeTargets);
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private async handleCommitCommand(msg: Extract<GraphWebviewToExtensionMessage, { readonly type: 'graph/commitCommand' }>): Promise<void> {
        const repo = await this.repositoryForScope(msg.repositoryScope);
        const shouldRefresh = await runCommitCommand(repo, msg.command, msg.hash, msg.hashes, undefined, undefined, undefined, diffExplanationScopeFor(msg.repositoryScope), this.extensionUri, this.storageUri, undefined, this.runtimeTargetsForScope(msg.repositoryScope));
        if (shouldRefresh) { await this.refreshAfterRepositoryChange(); }
    }

    private runtimeTargetsForScope(scope: GraphRepositoryScope | undefined): RuntimeCommandTargets {
        const context = this.repositories.currentContext;
        if (!context || !this.runtimeRepositories) {
            const repo = this.repositories.currentRepository;
            if (!isRuntimeRepository(repo)) { return {}; }
            return isRuntimeWorktree(repo)
                ? { repository: repo, worktree: repo, worktrees: [repo] }
                : { repository: repo };
        }
        try {
            const normalized = normalizedScope(scope);
            if (normalized.kind === 'submodule' && normalized.path) {
                const subCwd = path.resolve(context.cwd, normalized.path);
                const subId = stableRepoContextId(subCwd);
                const repository = this.runtimeRepositories.resolveRepository({ repoId: subId, kind: 'submodule', path: subCwd, parentRepoId: context.id });
                return {
                    repository,
                    worktree: this.runtimeRepositories.resolveWorktree({ repoId: subId, worktreeId: subId, path: subCwd }),
                    worktrees: this.runtimeRepositories.worktrees(repository.repoId),
                };
            }
            const repository = this.runtimeRepositories.resolveRepository(toRepositoryLocator(context));
            return {
                repository,
                worktree: this.runtimeRepositories.resolveWorktree(toWorktreeLocator(context)),
                worktrees: this.runtimeRepositories.worktrees(repository.repoId),
            };
        } catch {
            return {};
        }
    }

    private runtimeTargetsForWorktreePath(scope: GraphRepositoryScope | undefined, worktreePath: string): RuntimeCommandTargets {
        const context = this.repositories.currentContext;
        if (!context || !this.runtimeRepositories) {
            const repo = this.repositories.currentRepository;
            if (!isRuntimeRepository(repo)) { return {}; }
            return isRuntimeWorktree(repo) && path.normalize(repo.path) === path.normalize(worktreePath)
                ? { repository: repo, worktree: repo, worktrees: [repo] }
                : { repository: repo, worktrees: isRuntimeWorktree(repo) ? [repo] : [] };
        }
        try {
            const normalized = normalizedScope(scope);
            let repository: RuntimeCommandTargets['repository'];
            if (normalized.kind === 'submodule' && normalized.path) {
                const subCwd = path.resolve(context.cwd, normalized.path);
                const subId = stableRepoContextId(subCwd);
                repository = this.runtimeRepositories.resolveRepository({ repoId: subId, kind: 'submodule', path: subCwd, parentRepoId: context.id });
            } else {
                repository = this.runtimeRepositories.resolveRepository(toRepositoryLocator(context));
            }
            const normalizedWorktreePath = path.normalize(worktreePath);
            const worktree = this.runtimeRepositories
                .worktrees(repository.repoId)
                .find((candidate) => path.normalize(candidate.path) === normalizedWorktreePath);
            return worktree
                ? { repository, worktree, worktrees: this.runtimeRepositories.worktrees(repository.repoId) }
                : { repository, worktrees: this.runtimeRepositories.worktrees(repository.repoId) };
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
                repositoryScope: invalidatedBranchFilter.repositoryScope,
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

function toProtocolGraphData(result: GraphDataResult, repositoryScope: GraphRepositoryScope): GraphData {
    const currentBranchCommits = new Set(result.currentBranchCommitHashes);
    return {
        repositoryScope,
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
        worktrees: result.worktrees.map(toProtocolWorktree),
        worktreeWips: result.worktreeWips,
        submodules: result.submodules.map(toProtocolGraphSubmodule),
    };
}

function normalizedScope(scope: GraphRepositoryScope | undefined): GraphRepositoryScope {
    const submodulePath = submodulePathForScope(scope);
    if (!submodulePath) { return { kind: 'main' }; }
    return scope?.label
        ? { kind: 'submodule', path: submodulePath, label: scope.label }
        : { kind: 'submodule', path: submodulePath };
}

function submodulePathForScope(scope: GraphRepositoryScope | undefined): string | undefined {
    if (!scope || scope.kind !== 'submodule') { return undefined; }
    const submodulePath = scope.path?.trim();
    if (!submodulePath || path.isAbsolute(submodulePath) || submodulePath.split(/[\\/]+/).includes('..')) {
        throw new Error('Invalid submodule scope.');
    }
    return submodulePath;
}

function graphRequestKey(repoId: string, scope: GraphRepositoryScope | undefined, kind: 'replace' | 'more' | 'submodules'): string {
    return `${repoId}:${graphScopeKey(scope)}:${kind}`;
}

function graphScopeKey(scope: GraphRepositoryScope | undefined): string {
    if (!scope || scope.kind === 'main') { return 'main'; }
    return `submodule:${scope.path ?? ''}`;
}

function requestIdOf(msg: GraphWebviewToExtensionMessage): RequestId | undefined {
    return 'requestId' in msg ? msg.requestId : undefined;
}

function repositoryScopeOf(msg: GraphWebviewToExtensionMessage): GraphRepositoryScope | undefined {
    return 'repositoryScope' in msg ? msg.repositoryScope : undefined;
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

function conflictFileSet(status: import('../../core/git/domain/GitStatus').GitStatus): ReadonlySet<string> {
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
                repositoryScope: msg.repositoryScope,
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
                repositoryScope: msg.repositoryScope,
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
        case 'planInteractiveRebaseOnto':
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
                repositoryScope: msg.repositoryScope,
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
                repositoryScope: msg.repositoryScope,
            };
        case 'resetCurrentBranchToHere':
        case 'undoCommit':
        case 'editCommitMessage':
        case 'squashInto':
        case 'dropCommit':
        case 'interactiveRebaseFromHere':
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

function diffExplanationScopeFor(scope: GraphRepositoryScope | undefined): { readonly label: string; readonly value: string } | undefined {
    if (scope?.kind !== 'submodule' || !scope.path) { return undefined; }
    return { label: 'Submodule', value: scope.path };
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
        repositoryScope: { kind: 'main' },
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

function isRuntimeRepository(repo: LegacyGitRepository | undefined): repo is LegacyGitRepository & GitRepository {
    return typeof repo === 'object'
        && repo !== null
        && typeof (repo as { readonly getCommitGraph?: unknown }).getCommitGraph === 'function'
        && typeof (repo as { readonly listBranches?: unknown }).listBranches === 'function';
}

function isRuntimeWorktree(repo: LegacyGitRepository & GitRepository): repo is LegacyGitRepository & GitRepository & Worktree {
    return typeof (repo as { readonly worktreeId?: unknown }).worktreeId === 'string'
        && typeof (repo as { readonly path?: unknown }).path === 'string'
        && typeof (repo as { readonly cherryPick?: unknown }).cherryPick === 'function'
        && typeof (repo as { readonly getFileAtRevision?: unknown }).getFileAtRevision === 'function';
}
