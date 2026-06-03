import type { GraphContextTarget, GraphFilters, GraphPage, GraphRepositoryScope } from '../../../protocol/graph/types';
import type { BranchCommand, CommitCommand, GraphDataRequest, GraphRepositoryCommand, GraphWebviewToExtensionMessage, LoadMoreGraphRequest, WorktreeCommand } from '../../../protocol/graph/messages';

let requestCounter = 0;
function nextRequestId(): string {
    return `graph-req-${++requestCounter}`;
}

export function messageForGraphDataRequest(
    repoId: string,
    filters: GraphFilters,
    page: GraphPage,
    repositoryScope?: GraphRepositoryScope,
    requestId: string = nextRequestId(),
): GraphDataRequest {
    return {
        type: 'graph/dataRequest',
        requestId,
        repoId,
        filters,
        page,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForLoadMore(
    repoId: string,
    filters: GraphFilters,
    page: GraphPage,
    repositoryScope?: GraphRepositoryScope,
    requestId: string = nextRequestId(),
): LoadMoreGraphRequest {
    return {
        type: 'graph/loadMore',
        requestId,
        repoId,
        filters,
        page,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForCommitDetails(hash: string, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitDetailsRequest',
        requestId: nextRequestId(),
        hash,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForWorktreeDetails(path: string, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeDetailsRequest',
        requestId: nextRequestId(),
        path,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForBranchCheckout(branch: string, isRemote: boolean, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return messageForBranchCommand('checkout', branch, isRemote, repositoryScope);
}

export function messageForBranchCommand(command: BranchCommand, branch: string, isRemote: boolean, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/branchCommand',
        command,
        branch,
        isRemote,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForWorktreeCommand(command: WorktreeCommand, path?: string, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeCommand',
        command,
        path,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[] = [hash], repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitCommand',
        command,
        hash,
        hashes,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForGraphContextTarget(target: GraphContextTarget): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/contextTarget',
        target,
    };
}

export function messageForGraphRepositoryCommand(command: GraphRepositoryCommand, repositoryScope?: GraphRepositoryScope): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/repositoryCommand',
        command,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForOpenDiff(
    filePath: string,
    commitHash: string,
    status: string,
    origPath?: string,
    parentHash?: string,
    repositoryScope?: GraphRepositoryScope,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openDiff',
        filePath,
        commitHash,
        status,
        origPath,
        parentHash,
        ...scopeProperty(repositoryScope),
    };
}

export function messageForOpenWorktreeDiff(
    worktreePath: string,
    filePath: string,
    status: string,
    origPath?: string,
    repositoryScope?: GraphRepositoryScope,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openWorktreeDiff',
        worktreePath,
        filePath,
        status,
        origPath,
        ...scopeProperty(repositoryScope),
    };
}

function scopeProperty(repositoryScope: GraphRepositoryScope | undefined): { readonly repositoryScope: GraphRepositoryScope } | Record<string, never> {
    return repositoryScope ? { repositoryScope } : {};
}
