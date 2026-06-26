import { useEffect, useState } from 'react';
import type { ProtocolError } from '@protocol/shared/base';
import { isRecord } from '@webview/shared/type-guards';

export function useProtocolError(): ProtocolError | undefined {
    const [error, setError] = useState<ProtocolError>();

    useEffect(() => {
        const onMessage = (event: MessageEvent<unknown>) => {
            const nextError = readProtocolError(event.data);
            if (nextError) { setError(nextError); }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    return error;
}

export function readProtocolError(message: unknown): ProtocolError | undefined {
    if (!isRecord(message)) { return undefined; }
    const type = message.type;
    if (typeof type !== 'string' || (type !== 'error' && !type.endsWith('/error'))) {
        return undefined;
    }
    return isProtocolError(message.error) ? message.error : undefined;
}

function isProtocolError(value: unknown): value is ProtocolError {
    if (!isRecord(value)) { return false; }
    return typeof value.code === 'string'
        && typeof value.message === 'string'
        && typeof value.recoverable === 'boolean'
        && (value.operation === undefined || typeof value.operation === 'string')
        && (value.details === undefined || typeof value.details === 'string');
}
