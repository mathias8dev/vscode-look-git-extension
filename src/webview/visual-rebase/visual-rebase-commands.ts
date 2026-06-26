import type { VisualRebasePlanEntry } from '@protocol/visual-rebase/types';
import type { VisualRebaseAbortMessage, VisualRebaseAcceptIncomingMessage, VisualRebaseAcceptYoursMessage, VisualRebaseCancelMessage, VisualRebaseContinueMessage, VisualRebaseMarkResolvedMessage, VisualRebaseOpenFileMessage, VisualRebaseOpenMergeEditorMessage, VisualRebasePreviewRequest, VisualRebaseReadyMessage, VisualRebaseSkipMessage, VisualRebaseStartMessage } from '@protocol/visual-rebase/messages';

export function messageForVisualRebaseReady(): VisualRebaseReadyMessage {
    return { type: 'visualRebase/ready' };
}

export function messageForVisualRebaseStart(
    rewriteAfter: string,
    replayOnto: string,
    plan: readonly VisualRebasePlanEntry[],
): VisualRebaseStartMessage {
    return { type: 'visualRebase/start', rewriteAfter, replayOnto, plan };
}

export function messageForVisualRebasePreview(
    requestId: string,
    rewriteAfter: string,
    replayOnto: string,
): VisualRebasePreviewRequest {
    return { type: 'visualRebase/previewRequest' as const, requestId, rewriteAfter, replayOnto };
}

export function messageForVisualRebaseCancel(): VisualRebaseCancelMessage {
    return { type: 'visualRebase/cancel' };
}

export function messageForVisualRebaseContinue(): VisualRebaseContinueMessage {
    return { type: 'visualRebase/continue' };
}

export function messageForVisualRebaseAbort(): VisualRebaseAbortMessage {
    return { type: 'visualRebase/abort' };
}

export function messageForVisualRebaseSkip(): VisualRebaseSkipMessage {
    return { type: 'visualRebase/skip' };
}

export function messageForVisualRebaseOpenMergeEditor(filePath: string): VisualRebaseOpenMergeEditorMessage {
    return { type: 'visualRebase/openMergeEditor', filePath };
}

export function messageForVisualRebaseOpenFile(filePath: string): VisualRebaseOpenFileMessage {
    return { type: 'visualRebase/openFile', filePath };
}

export function messageForVisualRebaseMarkResolved(filePath: string): VisualRebaseMarkResolvedMessage {
    return { type: 'visualRebase/markResolved', filePath };
}

export function messageForVisualRebaseAcceptYours(filePath: string): VisualRebaseAcceptYoursMessage {
    return { type: 'visualRebase/acceptYours', filePath };
}

export function messageForVisualRebaseAcceptIncoming(filePath: string): VisualRebaseAcceptIncomingMessage {
    return { type: 'visualRebase/acceptIncoming', filePath };
}
