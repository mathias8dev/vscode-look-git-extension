import { describe, expect, it } from 'vitest';
import { readProtocolError } from '../../../src/webview/shared/useProtocolError';

describe('readProtocolError', () => {
    it('ignores non-error messages', () => {
        expect(readProtocolError({ type: 'graph/dataPush', data: { commits: [] } })).toBeUndefined();
    });

    it('reads structured protocol errors', () => {
        expect(readProtocolError({
            type: 'graph/error',
            message: 'Graph failed',
            error: {
                code: 'refreshFailed',
                message: 'Graph failed',
                operation: 'graph/refresh',
                recoverable: true,
            },
        })).toEqual({
            code: 'refreshFailed',
            message: 'Graph failed',
            operation: 'graph/refresh',
            recoverable: true,
        });
    });

    it('falls back to legacy message-only error payloads', () => {
        expect(readProtocolError({ type: 'error', message: 'Legacy failure' })).toEqual({
            code: 'unknown',
            message: 'Legacy failure',
            operation: 'error',
            recoverable: true,
        });
    });
});
