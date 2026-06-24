import * as path from 'path';
import { realpathSync } from 'fs';

export function normalizePathForComparison(resourcePath: string): string {
    let resolved = path.resolve(resourcePath);
    try {
        resolved = realpathSync.native(resolved);
    } catch {
        resolved = path.normalize(resolved);
    }
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function samePath(left: string, right: string): boolean {
    return normalizePathForComparison(left) === normalizePathForComparison(right);
}

export function isPathInside(resourcePath: string, parentPath: string): boolean {
    const relativePath = path.relative(normalizePathForComparison(parentPath), normalizePathForComparison(resourcePath));
    return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
