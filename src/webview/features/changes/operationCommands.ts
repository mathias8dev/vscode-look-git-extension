import type { ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import { ConflictState } from '@protocol/changes/types';

export type ActiveConflictState = Exclude<ConflictState, ConflictState.None>;

export enum OperationAction {
    OpenFirstMergeEditor = 'openFirstMergeEditor',
    OpenAllMergeEditors = 'openAllMergeEditors',
    Continue = 'continue',
    Abort = 'abort',
    AcceptAllTheirs = 'acceptAllTheirs',
}

export function messageForOperationAction(
    conflictState: ActiveConflictState,
    action: OperationAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case OperationAction.OpenFirstMergeEditor:
            return { type: 'changes/openFirstMergeEditor' };
        case OperationAction.OpenAllMergeEditors:
            return { type: 'changes/openAllMergeEditors' };
        case OperationAction.Continue:
            return { type: 'changes/continueOp', conflictState };
        case OperationAction.Abort:
            return { type: 'changes/abortOp', conflictState };
        case OperationAction.AcceptAllTheirs:
            return { type: 'changes/acceptAllTheirs' };
    }
}
