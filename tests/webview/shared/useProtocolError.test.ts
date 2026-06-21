import { describe, expect, it } from 'vitest';
import { readProtocolError } from '@webview/shared/useProtocolError';

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

    it('ignores message-only error payloads without structured protocol errors', () => {
        expect(readProtocolError({ type: 'error', message: 'Missing structured error' })).toBeUndefined();
    });
});
