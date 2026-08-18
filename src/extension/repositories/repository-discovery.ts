import * as path from 'path';
import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { DEFAULT_REPOSITORY_SCAN_MAX_DEPTH, normalizeRepositoryScanMaxDepth } from '@extension/repositories/repository-scan-depth';
import { isPathInside, normalizePathForComparison, samePath } from '@extension/utils/path-compare';
import { queryRegisteredSubmodulePaths } from '@extension/git/queries/query-submodules';

const IGNORED_DIRECTORY_NAMES = new Set([
    '.git',
    '.vscode',
    '.vscode-test',
    '.wdio-vscode',
    'coverage',
    'dist',
    'node_modules',
    'out',
]);

export interface RepositoryDiscoveryInput {
    readonly workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
    readonly resolveRepositoryScanMaxDepth?: (workspaceFolder: vscode.WorkspaceFolder) => number;
    readonly signal?: AbortSignal;
}

export async function discoverRepositoryContexts(input: RepositoryDiscoveryInput): Promise<readonly RepoContext[]> {
    const contexts = new Map<string, RepoContext>();

    for (const folder of input.workspaceFolders ?? []) {
        input.signal?.throwIfAborted();
        const maxDepth = normalizeRepositoryScanMaxDepth(input.resolveRepositoryScanMaxDepth?.(folder));
        const workspaceContext = await discoverWorkspaceRepositoryContext(folder.uri.fsPath, input.signal);
        if (workspaceContext) {
            addContext(contexts, workspaceContext);
        }

        for (const context of await discoverNestedRepositoryContexts(folder.uri.fsPath, workspaceContext, maxDepth, input.signal)) {
            addContext(contexts, context);
        }
    }

    return [...contexts.values()];
}

export async function discoverChildRepositoryContexts(
    parentContext: RepoContext,
    maxDepth = DEFAULT_REPOSITORY_SCAN_MAX_DEPTH,
    signal?: AbortSignal,
): Promise<readonly RepoContext[]> {
    return discoverNestedRepositoryContexts(parentContext.cwd, parentContext, normalizeRepositoryScanMaxDepth(maxDepth), signal);
}

async function discoverWorkspaceRepositoryContext(cwd: string, signal?: AbortSignal): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'], { signal })).trim();
        return root && samePath(root, cwd) ? createRepoContext(root) : undefined;
    } catch {
        signal?.throwIfAborted();
        return undefined;
    }
}

async function discoverNestedRepositoryContexts(
    workspacePath: string,
    workspaceContext: RepoContext | undefined,
    maxDepth: number,
    signal?: AbortSignal,
): Promise<readonly RepoContext[]> {
    const contexts: RepoContext[] = [];
    const scanRoot = workspaceContext?.cwd ?? workspacePath;
    const registeredSubmodulePathsByParentId = new Map<string, Promise<readonly string[]>>();
    const queue: Array<{
        readonly dirPath: string;
        readonly depth: number;
        readonly parentContext?: RepoContext;
    }> = [{ dirPath: scanRoot, depth: 0, parentContext: workspaceContext }];

    while (queue.length > 0) {
        signal?.throwIfAborted();
        const current = queue.shift();
        if (!current) { break; }

        if (current.parentContext && await isRegisteredSubmodulePath(current.parentContext, current.dirPath, registeredSubmodulePathsByParentId, signal)) {
            continue;
        }

        const isWorkspaceRepositoryRoot = workspaceContext && samePath(current.dirPath, workspaceContext.cwd);
        if (!isWorkspaceRepositoryRoot && await hasGitMarker(current.dirPath)) {
            const context = await discoverRepositoryContextAtRoot(current.dirPath, current.parentContext, signal);
            if (context) { contexts.push(context); }
            if (current.depth >= maxDepth) { continue; }
            for (const childPath of await readableChildDirectories(current.dirPath, signal)) {
                queue.push({ dirPath: childPath, depth: current.depth + 1, parentContext: context });
            }
            continue;
        }

        if (current.depth >= maxDepth) { continue; }

        for (const childPath of await readableChildDirectories(current.dirPath, signal)) {
            queue.push({ dirPath: childPath, depth: current.depth + 1, parentContext: current.parentContext });
        }
    }

    return contexts;
}

async function discoverRepositoryContextAtRoot(cwd: string, parentContext: RepoContext | undefined, signal?: AbortSignal): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'], { signal })).trim();
        return samePath(root, cwd) ? createRepoContext(root, parentContext?.id) : undefined;
    } catch {
        signal?.throwIfAborted();
        return undefined;
    }
}

async function isRegisteredSubmodulePath(
    parentContext: RepoContext,
    dirPath: string,
    cache: Map<string, Promise<readonly string[]>>,
    signal?: AbortSignal,
): Promise<boolean> {
    const submodulePaths = await cachedRegisteredSubmodulePaths(parentContext, cache, signal);
    return submodulePaths.some((submodulePath) => samePath(submodulePath, dirPath) || isPathInside(dirPath, submodulePath));
}

function cachedRegisteredSubmodulePaths(parentContext: RepoContext, cache: Map<string, Promise<readonly string[]>>, signal?: AbortSignal): Promise<readonly string[]> {
    const cached = cache.get(parentContext.id);
    if (cached) { return cached; }

    const submodulePaths = registeredSubmodulePaths(parentContext.cwd, signal);
    cache.set(parentContext.id, submodulePaths);
    return submodulePaths;
}

async function registeredSubmodulePaths(cwd: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
        const git = new GitCliBackend(cwd);
        return (await queryRegisteredSubmodulePaths((args, requestSignal) => git.run(args, { signal: requestSignal }), signal))
            .map((submodulePath) => path.resolve(cwd, submodulePath));
    } catch {
        signal?.throwIfAborted();
        return [];
    }
}

async function hasGitMarker(dirPath: string): Promise<boolean> {
    try {
        await fs.lstat(path.join(dirPath, '.git'));
        return true;
    } catch {
        return false;
    }
}

async function readableChildDirectories(dirPath: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
        signal?.throwIfAborted();
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        signal?.throwIfAborted();
        return entries
            .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORY_NAMES.has(entry.name))
            .map((entry) => path.join(dirPath, entry.name))
            .sort((left, right) => left.localeCompare(right));
    } catch {
        signal?.throwIfAborted();
        return [];
    }
}

function addContext(contexts: Map<string, RepoContext>, context: RepoContext): void {
    contexts.set(normalizePathForComparison(context.cwd), context);
}
