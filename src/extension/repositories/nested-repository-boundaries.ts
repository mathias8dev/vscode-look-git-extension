import * as path from 'path';
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

function repositoryRelativePath(parentPath: string, childPath: string): string | undefined {
    const relativePath = path.relative(parentPath, childPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) { return undefined; }
    return normalizeGitPath(relativePath);
}

function normalizeGitPath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isUntracked(entry: GitStatusEntry): boolean {
    return entry.indexStatus === '?' || entry.workTreeStatus === '?';
}
