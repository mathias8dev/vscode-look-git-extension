export function sameResourcePath(left: string | undefined, right: string | undefined): boolean {
    if (!left || !right) { return left === right; }
    return normalizeResourcePath(left) === normalizeResourcePath(right);
}

function normalizeResourcePath(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return isWindowsPath(normalized) ? normalized.toLowerCase() : normalized;
}

function isWindowsPath(normalized: string): boolean {
    // Drive-letter (C:/...) and UNC (//server/share/...) paths are case-insensitive on Windows.
    return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//');
}