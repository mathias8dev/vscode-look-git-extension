import type { VisualRebasePlanEntry } from '../../protocol/visual-rebase/types';
import type { VisualRebaseAbortMessage, VisualRebaseAcceptIncomingMessage, VisualRebaseAcceptYoursMessage, VisualRebaseCancelMessage, VisualRebaseContinueMessage, VisualRebaseMarkResolvedMessage, VisualRebaseOpenMergeEditorMessage, VisualRebaseReadyMessage, VisualRebaseSkipMessage, VisualRebaseStartMessage } from '../../protocol/visual-rebase/messages';

export function messageForVisualRebaseReady(): VisualRebaseReadyMessage {
    return { type: 'visualRebase/ready' };
}

export function messageForVisualRebaseStart(plan: readonly VisualRebasePlanEntry[]): VisualRebaseStartMessage {
    return { type: 'visualRebase/start', plan };
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

export function messageForVisualRebaseMarkResolved(filePath: string): VisualRebaseMarkResolvedMessage {
    return { type: 'visualRebase/markResolved', filePath };
}

export function messageForVisualRebaseAcceptYours(filePath: string): VisualRebaseAcceptYoursMessage {
    return { type: 'visualRebase/acceptYours', filePath };
}

export function messageForVisualRebaseAcceptIncoming(filePath: string): VisualRebaseAcceptIncomingMessage {
    return { type: 'visualRebase/acceptIncoming', filePath };
}
