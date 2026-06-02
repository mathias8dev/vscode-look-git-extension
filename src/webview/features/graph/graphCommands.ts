import type { GraphContextTarget, GraphFilters, GraphPage } from '../../../protocol/graph/types';
import type { BranchCommand, CommitCommand, GraphRepositoryCommand, GraphWebviewToExtensionMessage, WorktreeCommand } from '../../../protocol/graph/messages';

let requestCounter = 0;
function nextRequestId(): string {
    return `graph-req-${++requestCounter}`;
}

export function messageForGraphDataRequest(
    repoId: string,
    filters: GraphFilters,
    page: GraphPage,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/dataRequest',
        requestId: nextRequestId(),
        repoId,
        filters,
        page,
    };
}

export function messageForLoadMore(
    repoId: string,
    filters: GraphFilters,
    page: GraphPage,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/loadMore',
        requestId: nextRequestId(),
        repoId,
        filters,
        page,
    };
}

export function messageForCommitDetails(hash: string): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitDetailsRequest',
        requestId: nextRequestId(),
        hash,
    };
}

export function messageForWorktreeDetails(path: string): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeDetailsRequest',
        requestId: nextRequestId(),
        path,
    };
}

export function messageForBranchCheckout(branch: string, isRemote: boolean): GraphWebviewToExtensionMessage {
    return messageForBranchCommand('checkout', branch, isRemote);
}

export function messageForBranchCommand(command: BranchCommand, branch: string, isRemote: boolean): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/branchCommand',
        command,
        branch,
        isRemote,
    };
}

export function messageForWorktreeCommand(command: WorktreeCommand, path?: string): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/worktreeCommand',
        command,
        path,
    };
}

export function messageForCommitCommand(command: CommitCommand, hash: string, hashes: readonly string[] = [hash]): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/commitCommand',
        command,
        hash,
        hashes,
    };
}

export function messageForGraphContextTarget(target: GraphContextTarget): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/contextTarget',
        target,
    };
}

export function messageForGraphRepositoryCommand(command: GraphRepositoryCommand): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/repositoryCommand',
        command,
    };
}

export function messageForOpenDiff(
    filePath: string,
    commitHash: string,
    status: string,
    origPath?: string,
    parentHash?: string,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openDiff',
        filePath,
        commitHash,
        status,
        origPath,
        parentHash,
    };
}

export function messageForOpenWorktreeDiff(
    worktreePath: string,
    filePath: string,
    status: string,
    origPath?: string,
): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/openWorktreeDiff',
        worktreePath,
        filePath,
        status,
        origPath,
    };
}
