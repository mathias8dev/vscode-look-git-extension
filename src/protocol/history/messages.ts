import type { ErrorMessage, Pagination, ProtocolError, RequestId } from '../shared/base';
import type { SerializedRepoContext } from '../shared/repo';
import type { HistoryCommitDetails, HistoryContextTarget, HistoryData } from './types';

export interface RepoContextChangedPush {
    readonly type: 'repo/contextChanged';
    readonly context: SerializedRepoContext;
}

export interface HistoryDataPush {
    readonly type: 'history/data';
    readonly data: HistoryData;
}

export interface HistoryDataResponse {
    readonly type: 'history/dataResponse';
    readonly requestId: RequestId;
    readonly data: HistoryData;
}

export interface HistoryErrorPush {
    readonly type: 'history/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
}

export interface HistoryCommitDetailsResponse {
    readonly type: 'history/commitDetailsResponse';
    readonly requestId: RequestId;
    readonly details: HistoryCommitDetails;
}

export interface HistorySelectCommitPush {
    readonly type: 'history/selectCommit';
    readonly hash: string;
}

export type HistoryExtensionToWebviewMessage =
    | RepoContextChangedPush
    | HistoryDataPush
    | HistoryDataResponse
    | HistoryCommitDetailsResponse
    | HistorySelectCommitPush
    | HistoryErrorPush
    | ErrorMessage;

export interface HistoryReadyMessage {
    readonly type: 'history/ready';
}

export interface HistoryDataRequest {
    readonly type: 'history/dataRequest';
    readonly requestId: RequestId;
    readonly page: Pagination;
}

export interface HistoryRefreshMessage {
    readonly type: 'history/refresh';
}

export interface HistoryCommitDetailsRequest {
    readonly type: 'history/commitDetailsRequest';
    readonly requestId: RequestId;
    readonly hash: string;
}

export interface HistoryOpenDiffRequest {
    readonly type: 'history/openDiff';
    readonly filePath: string;
    readonly commitHash: string;
    readonly status: string;
    readonly origPath?: string;
    readonly parentHash?: string;
}

export interface HistoryContextTargetMessage {
    readonly type: 'history/contextTarget';
    readonly target: HistoryContextTarget;
}

export type HistoryToolbarCommand =
    | 'selectBranch'
    | 'goToCurrent'
    | 'fetchAll'
    | 'pull'
    | 'push';

export interface HistoryToolbarCommandMessage {
    readonly type: 'history/toolbarCommand';
    readonly command: HistoryToolbarCommand;
}

export type HistoryWebviewToExtensionMessage =
    | HistoryReadyMessage
    | HistoryDataRequest
    | HistoryRefreshMessage
    | HistoryCommitDetailsRequest
    | HistoryOpenDiffRequest
    | HistoryContextTargetMessage
    | HistoryToolbarCommandMessage;
