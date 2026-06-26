import type { ErrorCode, ProtocolError } from '@protocol/shared/base';

export interface ErrorSerializationOptions {
    readonly code?: ErrorCode;
    readonly operation?: string;
    readonly recoverable?: boolean;
    readonly details?: string;
}

export interface ErrorPayload {
    readonly message: string;
    readonly error: ProtocolError;
}

export function isAbortError(error: unknown): boolean {
    return readStringProperty(error, 'name') === 'AbortError';
}

export function serializeProtocolError(error: unknown, options: ErrorSerializationOptions = {}): ProtocolError {
    const code = options.code ?? inferErrorCode(error);
    const details = options.details ?? inferDetails(error);
    return {
        code,
        message: inferMessage(error),
        operation: options.operation,
        recoverable: options.recoverable ?? code !== 'cancelled',
        details,
    };
}

export function createErrorPayload(error: unknown, options: ErrorSerializationOptions = {}): ErrorPayload {
    const serialized = serializeProtocolError(error, options);
    return { message: serialized.message, error: serialized };
}

function inferErrorCode(error: unknown): ErrorCode {
    if (isAbortError(error)) { return 'cancelled'; }
    const message = inferMessage(error);
    if (message === 'No active Git repository.') { return 'noRepository'; }
    const processCode = readStringProperty(error, 'code');
    return processCode ? `git.${processCode}` : 'unknown';
}

function inferMessage(error: unknown): string {
    if (error instanceof Error && error.message) { return error.message; }
    const message = readStringProperty(error, 'message');
    if (message) { return message; }
    return String(error);
}

function inferDetails(error: unknown): string | undefined {
    const stderr = readStringProperty(error, 'stderr');
    if (stderr) { return stderr; }
    const stdout = readStringProperty(error, 'stdout');
    return stdout || undefined;
}

function readStringProperty(value: unknown, key: string): string | undefined {
    if (typeof value !== 'object' || value === null) { return undefined; }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
