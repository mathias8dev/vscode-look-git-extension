import * as path from 'path';
import * as fs from 'fs/promises';
import type { RepoContext } from '@core/git/domain/repo-context';
import { RepoKind } from '@core/git/domain/repo-context';
import type { GitStatus, GitStatusEntry } from '@core/git/domain/git-status';

export function nestedRepositoryPaths(
    parentContext: RepoContext,
    contexts: readonly RepoContext[],
): ReadonlySet<string> {
    return new Set(contexts
        .filter((context) => context.kind === RepoKind.Main && context.parentId === parentContext.id)
        .map((context) => repositoryRelativePath(parentContext.cwd, context.cwd))
        .filter((relativePath): relativePath is string => relativePath !== undefined));
}

export function excludeNestedRepositoryChanges(
    status: GitStatus,
    repositoryPaths: ReadonlySet<string>,
): GitStatus {
    if (repositoryPaths.size === 0) { return status; }
    const visibleEntry = (entry: GitStatusEntry) => !isUntracked(entry)
        || !repositoryPaths.has(normalizeGitPath(entry.filePath));
    return {
        ...status,
        staged: status.staged.filter(visibleEntry),
        unstaged: status.unstaged.filter(visibleEntry),
        conflicts: status.conflicts.filter(visibleEntry),
    };
}

export function excludeNestedRepositoryWorktreeFiles<T extends { readonly status: string; readonly filePath: string }>(
    files: readonly T[],
    repositoryPaths: ReadonlySet<string>,
): readonly T[] {
    if (repositoryPaths.size === 0) { return files; }
    return files.filter((file) => file.status !== '?'
        || !repositoryPaths.has(normalizeGitPath(file.filePath)));
}

export async function resolveNestedRepositoryPaths(
    worktreePath: string,
    untrackedPaths: readonly string[],
    knownRepositoryPaths: ReadonlySet<string>,
    signal?: AbortSignal,
): Promise<ReadonlySet<string>> {
    const repositoryPaths = new Set(knownRepositoryPaths);
    const candidates = [...new Set(untrackedPaths
        .filter((filePath) => filePath.endsWith('/'))
        .map(normalizeGitPath))]
        .filter((filePath) => !repositoryPaths.has(filePath));
    const detected = await Promise.all(candidates.map(async (filePath) => ({
        filePath,
        isRepository: await hasGitMarker(worktreePath, filePath, signal),
    })));
    for (const candidate of detected) {
        if (candidate.isRepository) { repositoryPaths.add(candidate.filePath); }
    }
    return repositoryPaths;
}

function repositoryRelativePath(parentPath: string, childPath: string): string | undefined {
    const relativePath = path.relative(parentPath, childPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) { return undefined; }
    return normalizeGitPath(relativePath);
}

function normalizeGitPath(filePath: string): string {
    const separatorsNormalized = process.platform === 'win32' ? filePath.replace(/\\/g, '/') : filePath;
    const normalized = separatorsNormalized.replace(/^\.\//, '').replace(/\/+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function hasGitMarker(worktreePath: string, filePath: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const candidatePath = path.resolve(worktreePath, filePath);
    const relativePath = path.relative(worktreePath, candidatePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) { return false; }
    try {
        await fs.lstat(path.join(candidatePath, '.git'));
        signal?.throwIfAborted();
        return true;
    } catch {
        signal?.throwIfAborted();
        return false;
    }
}

function isUntracked(entry: GitStatusEntry): boolean {
    return entry.indexStatus === '?' || entry.workTreeStatus === '?';
}
