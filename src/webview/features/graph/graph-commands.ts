import type { GraphContextTarget, GraphFilters, GraphPage } from '@protocol/graph/types';
import type { BranchCommand, CommitCommand, GraphDataRequest, GraphRepositoryCommand, GraphWebviewToExtensionMessage, LoadMoreGraphRequest, WorktreeCommand } from '@protocol/graph/messages';
import type { RepositoryLocator, WorktreeLocator } from '@protocol/shared/repo';

let requestCounter = 0;
function nextRequestId(): string {
    return `graph-req-${++requestCounter}`;
}

export function messageForGraphDataRequest(
    repoId: string | undefined,
    filters: GraphFilters,
    page: GraphPage,
    repository?: RepositoryLocator,
    requestId: string = nextRequestId(),
): GraphDataRequest {
    return {
        type: 'graph/dataRequest',
        requestId,
        ...repoIdProperty(repoId),
        filters,
        page,
        ...repositoryProperty(repository),
    };
}

export function messageForLoadMore(
    repoId: string | undefined,
    filters: GraphFilters,
    page: GraphPage,
    repository?: RepositoryLocator,
    requestId: string = nextRequestId(),
): LoadMoreGraphRequest {
    return {
        type: 'graph/loadMore',
        requestId,
        ...repoIdProperty(repoId),
        filters,
        page,
        ...repositoryProperty(repository),
    };
}

export function messageForCommitDetails(hash: string, repository?: RepositoryLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitDetailsRequest',
        requestId: nextRequestId(),
        hash,
        ...repositoryProperty(repository),
    };
}

export function messageForWorktreeDetails(path: string, repository?: RepositoryLocator, worktree?: WorktreeLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeDetailsRequest',
        requestId: nextRequestId(),
        path,
        ...repositoryProperty(repository),
        ...worktreeProperty(worktree),
    };
}

export function messageForBranchCheckout(branch: string, isRemote: boolean, repository?: RepositoryLocator): GraphWebviewToExtensionMessage {
    return messageForBranchCommand('checkout', branch, isRemote, repository);
}

export function messageForBranchCommand(command: BranchCommand, branch: string, isRemote: boolean, repository?: RepositoryLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/branchCommand',
        command,
        branch,
        isRemote,
        ...repositoryProperty(repository),
    };
}

export function messageForWorktreeCommand(command: WorktreeCommand, path?: string, repository?: RepositoryLocator, worktree?: WorktreeLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeCommand',
        command,
        path,
        ...repositoryProperty(repository),
        ...worktreeProperty(worktree),
    };
}

export function messageForCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[] = [hash], repository?: RepositoryLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitCommand',
        command,
        hash,
        hashes,
        ...repositoryProperty(repository),
    };
}

export function messageForGraphContextTarget(target: GraphContextTarget): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/contextTarget',
        target,
    };
}

export function messageForGraphRepositoryCommand(command: GraphRepositoryCommand, repository?: RepositoryLocator): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/repositoryCommand',
        command,
        ...repositoryProperty(repository),
    };
}

export function messageForOpenDiff(
    filePath: string,
    commitHash: string,
    status: string,
    origPath?: string,
    parentHash?: string,
    isSubmodule?: boolean,
    repository?: RepositoryLocator,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openDiff',
        filePath,
        commitHash,
        status,
        origPath,
        parentHash,
        isSubmodule,
        ...repositoryProperty(repository),
    };
}

export function messageForOpenWorktreeDiff(
    worktreePath: string,
    filePath: string,
    status: string,
    origPath?: string,
    isSubmodule?: boolean,
    repository?: RepositoryLocator,
    worktree?: WorktreeLocator,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openWorktreeDiff',
        worktreePath,
        filePath,
        status,
        origPath,
        isSubmodule,
        ...repositoryProperty(repository),
        ...worktreeProperty(worktree),
    };
}

function repoIdProperty(repoId: string | undefined): { readonly repoId: string } | Record<string, never> {
    return repoId ? { repoId } : {};
}

function repositoryProperty(repository: RepositoryLocator | undefined): { readonly repository: RepositoryLocator } | Record<string, never> {
    return repository ? { repository } : {};
}

function worktreeProperty(worktree: WorktreeLocator | undefined): { readonly worktree: WorktreeLocator } | Record<string, never> {
    return worktree ? { worktree } : {};
}
