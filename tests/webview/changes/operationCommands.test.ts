import { describe, expect, it } from 'vitest';
import { messageForOperationAction, OperationAction } from '../../../src/webview/features/changes/operationCommands';
import { ConflictState } from '../../../src/protocol/changes/types';

describe('operationCommands', () => {
    it('creates messages for merge and rebase operation actions', () => {
        expect(messageForOperationAction(ConflictState.Merge, OperationAction.OpenFirstMergeEditor)).toEqual({
            type: 'changes/openFirstMergeEditor',
        });
        expect(messageForOperationAction(ConflictState.Merge, OperationAction.OpenAllMergeEditors)).toEqual({
            type: 'changes/openAllMergeEditors',
        });
        expect(messageForOperationAction(ConflictState.Merge, OperationAction.Continue)).toEqual({
            type: 'changes/continueOp',
            conflictState: 'merge',
        });
        expect(messageForOperationAction(ConflictState.Rebase, OperationAction.Abort)).toEqual({
            type: 'changes/abortOp',
            conflictState: 'rebase',
        });
        expect(messageForOperationAction(ConflictState.Merge, OperationAction.AcceptAllTheirs)).toEqual({
            type: 'changes/acceptAllTheirs',
        });
    });
});
