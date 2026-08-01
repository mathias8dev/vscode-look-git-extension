export function isUnbornHeadError(error: unknown): boolean {
    const text = gitErrorText(error).toLowerCase();
    return text.includes("ambiguous argument 'head'")
        && text.includes('unknown revision or path not in the working tree');
}

export function gitErrorText(error: unknown): string {
    return [
        error instanceof Error ? error.message : String(error),
        stringErrorProperty(error, 'stderr'),
        stringErrorProperty(error, 'stdout'),
    ].filter((part) => part.length > 0).join('\n');
}

function stringErrorProperty(error: unknown, propertyName: 'stderr' | 'stdout'): string {
    if (typeof error !== 'object' || error === null) { return ''; }
    const descriptor = Object.getOwnPropertyDescriptor(error, propertyName);
    const value: unknown = descriptor?.value;
    return typeof value === 'string' ? value : '';
}
