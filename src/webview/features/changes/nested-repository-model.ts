import type { RepositorySummary } from '@protocol/shared/repo';

export function nestedRepositoryContextIdsByPath(
    repositories: readonly RepositorySummary[],
    activeContextId: string | undefined,
): ReadonlyMap<string, string> {
    if (!activeContextId) { return new Map(); }

    const activeRepository = repositories.find((repository) => repository.context.id === activeContextId);
    if (!activeRepository) { return new Map(); }

    const caseInsensitive = isWindowsPath(activeRepository.context.cwd);
    const parentPath = normalizeAbsolutePath(activeRepository.context.cwd, caseInsensitive);
    const result = new Map<string, string>();
    for (const repository of repositories) {
        if (repository.context.parentId !== activeContextId || repository.context.kind !== 'main') { continue; }
        const childPath = normalizeAbsolutePath(repository.context.cwd, caseInsensitive);
        const relativePath = relativeChildPath(parentPath, childPath);
        if (relativePath) { result.set(statusPathKey(relativePath, caseInsensitive), repository.context.id); }
    }
    return result;
}

export function nestedRepositoryContextId(
    contextIdsByPath: ReadonlyMap<string, string>,
    filePath: string,
): string | undefined {
    return contextIdsByPath.get(normalizeStatusPath(filePath))
        ?? contextIdsByPath.get(statusPathKey(filePath, false))
        ?? contextIdsByPath.get(statusPathKey(filePath, true));
}

function normalizeAbsolutePath(value: string, caseInsensitive: boolean): string {
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
    return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function normalizeStatusPath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function statusPathKey(value: string, caseInsensitive: boolean): string {
    const normalized = normalizeStatusPath(value);
    return `${caseInsensitive ? 'insensitive' : 'sensitive'}:${caseInsensitive ? normalized.toLowerCase() : normalized}`;
}

function isWindowsPath(value: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function relativeChildPath(parentPath: string, childPath: string): string | undefined {
    const prefix = `${parentPath}/`;
    return childPath.startsWith(prefix) ? childPath.slice(prefix.length) : undefined;
}
