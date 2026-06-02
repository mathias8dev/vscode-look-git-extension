import type { Pagination } from '../../../protocol/shared/base';
import type { HistoryToolbarCommand, HistoryWebviewToExtensionMessage } from '../../../protocol/history/messages';
import type { HistoryCommitFile, HistoryContextTarget } from '../../../protocol/history/types';

let requestCounter = 0;

function nextRequestId(): string {
    return `history-req-${++requestCounter}`;
}

export function messageForHistoryDataRequest(page: Pagination): HistoryWebviewToExtensionMessage {
    return {
        type: 'history/dataRequest',
        requestId: nextRequestId(),
        page,
    };
}

export function messageForHistoryReady(): HistoryWebviewToExtensionMessage {
    return { type: 'history/ready' };
}

export function messageForHistoryRefresh(): HistoryWebviewToExtensionMessage {
    return { type: 'history/refresh' };
}

export function messageForHistoryCommitDetails(hash: string): HistoryWebviewToExtensionMessage {
    return {
        type: 'history/commitDetailsRequest',
        requestId: nextRequestId(),
        hash,
    };
}

export function messageForHistoryOpenDiff(commitHash: string, file: HistoryCommitFile): HistoryWebviewToExtensionMessage {
    return {
        type: 'history/openDiff',
        commitHash,
        filePath: file.filePath,
        status: file.status,
        origPath: file.origPath,
        parentHash: file.parentHash,
    };
}

export function messageForHistoryContextTarget(target: HistoryContextTarget): HistoryWebviewToExtensionMessage {
    return {
        type: 'history/contextTarget',
        target,
    };
}

export function messageForHistoryToolbarCommand(command: HistoryToolbarCommand): HistoryWebviewToExtensionMessage {
    return {
        type: 'history/toolbarCommand',
        command,
    };
}
