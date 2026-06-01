import type { GraphFilters, GraphPage } from '../../../protocol/graph/types';
import type { GraphWebviewToExtensionMessage, WorktreeCommand } from '../../../protocol/graph/messages';

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

export function messageForBranchCheckout(branch: string, isRemote: boolean): GraphWebviewToExtensionMessage {
    return {
        type: 'graph/branchCommand',
        command: 'checkout',
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
