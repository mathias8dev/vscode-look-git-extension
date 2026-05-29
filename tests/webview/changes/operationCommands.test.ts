import { describe, expect, it } from 'vitest';
import { messageForOperationAction } from '../../../src/webview/features/changes/operationCommands';

describe('operationCommands', () => {
    it('creates messages for merge and rebase operation actions', () => {
        expect(messageForOperationAction('merge', 'continue')).toEqual({
            type: 'changes/continueOp',
            conflictState: 'merge',
        });
        expect(messageForOperationAction('rebase', 'abort')).toEqual({
            type: 'changes/abortOp',
            conflictState: 'rebase',
        });
        expect(messageForOperationAction('merge', 'acceptAllTheirs')).toEqual({
            type: 'changes/acceptAllTheirs',
        });
    });
});
