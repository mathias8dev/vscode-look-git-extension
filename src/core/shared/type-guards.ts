export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isAbortError(error: unknown): boolean {
    return isRecord(error) && error.name === 'AbortError';
}
