import type { VisualRebaseCommit, VisualRebasePlanEntry, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import type { WebviewFontSizeChangedPush } from '@protocol/shared/ui';

export type VisualRebaseRecommendedAction = 'continue' | 'skip';

export interface VisualRebaseInitPush {
    readonly type: 'visualRebase/init';
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly commits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety;
}

export interface VisualRebaseStartedPush {
    readonly type: 'visualRebase/started';
}

export interface VisualRebaseCompletedPush {
    readonly type: 'visualRebase/completed';
    readonly backupRef: string;
}

export interface VisualRebaseErrorPush {
    readonly type: 'visualRebase/error';
    readonly message: string;
    readonly conflictFiles?: readonly string[];
    readonly rebaseInProgress?: boolean;
    readonly recommendedAction?: VisualRebaseRecommendedAction;
}

export interface VisualRebaseReadyMessage {
    readonly type: 'visualRebase/ready';
}

export interface VisualRebaseStartMessage {
    readonly type: 'visualRebase/start';
    readonly plan: readonly VisualRebasePlanEntry[];
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
    | VisualRebaseErrorPush
    | WebviewFontSizeChangedPush;

export type VisualRebaseWebviewToExtensionMessage =
    | VisualRebaseReadyMessage
    | VisualRebaseStartMessage
    | VisualRebaseCancelMessage
    | VisualRebaseContinueMessage
    | VisualRebaseAbortMessage
    | VisualRebaseSkipMessage
    | VisualRebaseOpenMergeEditorMessage
    | VisualRebaseMarkResolvedMessage
    | VisualRebaseAcceptYoursMessage
    | VisualRebaseAcceptIncomingMessage;
