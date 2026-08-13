import type { CommitFileChange } from '@protocol/shared/commit';
import type { VisualRebaseCommit, VisualRebaseConflictFile, VisualRebasePlanEntry, VisualRebaseRef, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import type { WebviewFontSizeChangedPush } from '@protocol/shared/ui';

export type VisualRebaseRecommendedAction = 'continue' | 'skip';
export type VisualRebaseOperation = 'start' | 'continue' | 'skip' | 'abort' | 'resolveConflict';
export type VisualRebasePauseReason = 'conflicts' | 'stopped';

export interface VisualRebaseInitPush {
    readonly type: 'visualRebase/init';
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly commits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety;
    readonly refs: readonly VisualRebaseRef[];
}

export interface VisualRebaseStartedPush {
    readonly type: 'visualRebase/started';
    readonly operation: VisualRebaseOperation;
}

export interface VisualRebaseCompletedPush {
    readonly type: 'visualRebase/completed';
    readonly backupRef: string;
}

export interface VisualRebasePausedPush {
    readonly type: 'visualRebase/paused';
    readonly reason: VisualRebasePauseReason;
    readonly message: string;
    readonly details?: string;
    readonly conflictFiles: readonly VisualRebaseConflictFile[];
    readonly recommendedAction?: VisualRebaseRecommendedAction;
}

export interface VisualRebaseAbortedPush {
    readonly type: 'visualRebase/aborted';
}

export interface VisualRebaseErrorPush {
    readonly type: 'visualRebase/error';
    readonly message: string;
    readonly details?: string;
}

export interface VisualRebasePreviewResponse {
    readonly type: 'visualRebase/previewResponse';
    readonly requestId: string;
    readonly rewriteAfter: string;
    readonly replayOnto: string;
    readonly commits?: readonly VisualRebaseCommit[];
    readonly safety?: VisualRebaseSafety;
    readonly error?: string;
}

export interface VisualRebaseCommitDetailsResponse {
    readonly type: 'visualRebase/commitDetailsResponse';
    readonly requestId: string;
    readonly hash: string;
    readonly files: readonly CommitFileChange[];
    readonly error?: string;
}

export interface VisualRebaseReadyMessage {
    readonly type: 'visualRebase/ready';
}

export interface VisualRebaseStartMessage {
    readonly type: 'visualRebase/start';
    readonly rewriteAfter: string;
    readonly replayOnto: string;
    readonly plan: readonly VisualRebasePlanEntry[];
}

export interface VisualRebasePreviewRequest {
    readonly type: 'visualRebase/previewRequest';
    readonly requestId: string;
    readonly rewriteAfter: string;
    readonly replayOnto: string;
}

export interface VisualRebaseCommitDetailsRequest {
    readonly type: 'visualRebase/commitDetailsRequest';
    readonly requestId: string;
    readonly hash: string;
}

export interface VisualRebaseOpenCommitDiffMessage {
    readonly type: 'visualRebase/openCommitDiff';
    readonly commitHash: string;
    readonly filePath: string;
    readonly status: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}

export interface VisualRebaseCancelMessage {
    readonly type: 'visualRebase/cancel';
}

export interface VisualRebaseContinueMessage {
    readonly type: 'visualRebase/continue';
}

export interface VisualRebaseAbortMessage {
    readonly type: 'visualRebase/abort';
}

export interface VisualRebaseSkipMessage {
    readonly type: 'visualRebase/skip';
}

export interface VisualRebaseOpenMergeEditorMessage {
    readonly type: 'visualRebase/openMergeEditor';
    readonly filePath: string;
}

export interface VisualRebaseOpenFileMessage {
    readonly type: 'visualRebase/openFile';
    readonly filePath: string;
}

export interface VisualRebaseMarkResolvedMessage {
    readonly type: 'visualRebase/markResolved';
    readonly filePath: string;
}

export interface VisualRebaseAcceptYoursMessage {
    readonly type: 'visualRebase/acceptYours';
    readonly filePath: string;
}

export interface VisualRebaseAcceptIncomingMessage {
    readonly type: 'visualRebase/acceptIncoming';
    readonly filePath: string;
}

export type VisualRebaseExtensionToWebviewMessage =
    | VisualRebaseInitPush
    | VisualRebaseStartedPush
    | VisualRebaseCompletedPush
    | VisualRebasePausedPush
    | VisualRebaseAbortedPush
    | VisualRebaseErrorPush
    | VisualRebasePreviewResponse
    | VisualRebaseCommitDetailsResponse
    | WebviewFontSizeChangedPush;

export type VisualRebaseWebviewToExtensionMessage =
    | VisualRebaseReadyMessage
    | VisualRebaseStartMessage
    | VisualRebasePreviewRequest
    | VisualRebaseCommitDetailsRequest
    | VisualRebaseOpenCommitDiffMessage
    | VisualRebaseCancelMessage
    | VisualRebaseContinueMessage
    | VisualRebaseAbortMessage
    | VisualRebaseSkipMessage
    | VisualRebaseOpenMergeEditorMessage
    | VisualRebaseOpenFileMessage
    | VisualRebaseMarkResolvedMessage
    | VisualRebaseAcceptYoursMessage
    | VisualRebaseAcceptIncomingMessage;
