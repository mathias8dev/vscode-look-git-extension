import * as path from 'path';
import { realpathSync } from 'fs';

export function normalizePathForComparison(resourcePath: string): string {
    const resolved = canonicalizeExistingPrefix(path.resolve(resourcePath));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Resolve symlinks/junctions/8.3-names for the longest existing ancestor of `resolvedPath` and
 * re-append the not-yet-existing tail lexically. This keeps comparison symmetric: a file and its
 * containing directory canonicalize consistently whether or not the file still exists on disk, so a
 * deletion event under a symlinked/subst root is no longer misjudged as "outside the repository".
 */
function canonicalizeExistingPrefix(resolvedPath: string): string {
    try {
        return realpathSync.native(resolvedPath);
    } catch {
        const parent = path.dirname(resolvedPath);
        if (parent === resolvedPath) { return path.normalize(resolvedPath); }
        return path.join(canonicalizeExistingPrefix(parent), path.basename(resolvedPath));
    }
}

export function samePath(left: string, right: string): boolean {
    return normalizePathForComparison(left) === normalizePathForComparison(right);
}

export function isPathInside(resourcePath: string, parentPath: string): boolean {
    const relativePath = path.relative(normalizePathForComparison(parentPath), normalizePathForComparison(resourcePath));
    return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
