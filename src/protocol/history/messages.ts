import type { ErrorMessage, Pagination, ProtocolError, RequestId } from '../shared/base';
import type { OperationNoticeActionKind, OperationStatus } from '../shared/operation';
import type { SerializedRepoContext } from '../shared/repo';
import type { WebviewFontSizeChangedPush } from '../shared/ui';
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

export interface HistoryApplyFileViewModePush {
    readonly type: 'history/applyFileViewMode';
    readonly mode: 'list' | 'tree';
}

export interface HistoryOperationStatusPush {
    readonly type: 'history/operationStatus';
    readonly operationId: string;
    readonly status: OperationStatus;
    readonly command: HistoryToolbarCommand;
    readonly actions?: readonly OperationNoticeActionKind[];
}

export type HistoryExtensionToWebviewMessage =
    | RepoContextChangedPush
    | WebviewFontSizeChangedPush
    | HistoryDataPush
    | HistoryDataResponse
    | HistoryCommitDetailsResponse
    | HistorySelectCommitPush
    | HistoryApplyFileViewModePush
    | HistoryOperationStatusPush
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
    readonly isSubmodule?: boolean;
}

export interface HistoryContextTargetMessage {
    readonly type: 'history/contextTarget';
    readonly target: HistoryContextTarget;
}

export type HistoryToolbarCommand =
    | 'selectRepositoryScope'
    | 'selectBranch'
    | 'goToCurrent'
    | 'fetchAll'
    | 'pull'
    | 'push';

export interface HistoryToolbarCommandMessage {
    readonly type: 'history/toolbarCommand';
    readonly command: HistoryToolbarCommand;
}

export interface HistoryShowOutputMessage {
    readonly type: 'history/showOutput';
}

export type HistoryWebviewToExtensionMessage =
    | HistoryReadyMessage
    | HistoryDataRequest
    | HistoryRefreshMessage
    | HistoryCommitDetailsRequest
    | HistoryOpenDiffRequest
    | HistoryContextTargetMessage
    | HistoryToolbarCommandMessage
    | HistoryShowOutputMessage;
