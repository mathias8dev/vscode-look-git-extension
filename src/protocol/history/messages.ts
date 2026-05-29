import type { ErrorMessage, ProtocolError, RequestId } from '../shared/base';
import type { SerializedRepoContext } from '../shared/repo';
import type { HistoryCommit } from './types';

export interface RepoContextChangedPush {
    readonly type: 'repo/contextChanged';
    readonly context: SerializedRepoContext;
}

export interface HistoryDataPush {
    readonly type: 'history/data';
    readonly commits: readonly HistoryCommit[];
}

export interface HistoryErrorPush {
    readonly type: 'history/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
}

export type HistoryExtensionToWebviewMessage =
    | RepoContextChangedPush
    | HistoryDataPush
    | HistoryErrorPush
    | ErrorMessage;
