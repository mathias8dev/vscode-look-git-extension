import type { ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import type { ConflictState } from '../../../protocol/changes/types';

export type ActiveConflictState = Exclude<ConflictState, 'none'>;
export type OperationAction = 'continue' | 'abort' | 'acceptAllTheirs';

export function messageForOperationAction(
    conflictState: ActiveConflictState,
    action: OperationAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case 'continue':
            return { type: 'changes/continueOp', conflictState };
        case 'abort':
            return { type: 'changes/abortOp', conflictState };
        case 'acceptAllTheirs':
            return { type: 'changes/acceptAllTheirs' };
    }
}
