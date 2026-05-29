import { describe, expect, it } from 'vitest';
import { createErrorPayload, isAbortError, serializeProtocolError } from '../../../src/extension/messaging/errorSerialization';

describe('errorSerialization', () => {
    it('serializes ordinary errors with explicit operation metadata', () => {
        expect(serializeProtocolError(new Error('boom'), {
            code: 'gitOperationFailed',
            operation: 'changes/stageFile',
        })).toEqual({
            code: 'gitOperationFailed',
            message: 'boom',
            operation: 'changes/stageFile',
            recoverable: true,
            details: undefined,
        });
    });

    it('infers noRepository from the canonical repository error', () => {
        expect(serializeProtocolError(new Error('No active Git repository.'))).toEqual(expect.objectContaining({
            code: 'noRepository',
            message: 'No active Git repository.',
        }));
    });

    it('preserves process details when git exposes stderr and code', () => {
        const error = { message: 'git failed', code: 'ELOCKED', stderr: 'index.lock exists' };
        expect(serializeProtocolError(error)).toEqual(expect.objectContaining({
            code: 'git.ELOCKED',
            message: 'git failed',
            details: 'index.lock exists',
        }));
    });

    it('identifies abort errors as non-reportable cancellation', () => {
        const error = { name: 'AbortError', message: 'cancelled' };
        expect(isAbortError(error)).toBe(true);
        expect(serializeProtocolError(error)).toEqual(expect.objectContaining({
            code: 'cancelled',
            recoverable: false,
        }));
    });

    it('creates a legacy-compatible message plus structured error payload', () => {
        expect(createErrorPayload(new Error('failed'), { operation: 'graph/refresh' })).toEqual({
            message: 'failed',
            error: expect.objectContaining({
                message: 'failed',
                operation: 'graph/refresh',
            }),
        });
    });
});
