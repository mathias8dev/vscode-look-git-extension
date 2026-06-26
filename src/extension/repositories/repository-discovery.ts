import * as path from 'path';
import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { isPathInside, normalizePathForComparison, samePath } from '@extension/utils/path-compare';

const MAX_REPOSITORY_DISCOVERY_DEPTH = 1;
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
}

export async function discoverRepositoryContexts(input: RepositoryDiscoveryInput): Promise<readonly RepoContext[]> {
    const contexts = new Map<string, RepoContext>();

    for (const folder of input.workspaceFolders ?? []) {
        const workspaceContext = await discoverWorkspaceRepositoryContext(folder.uri.fsPath);
        if (workspaceContext) {
            addContext(contexts, workspaceContext);
        }

        for (const context of await discoverNestedRepositoryContexts(folder.uri.fsPath, workspaceContext)) {
            addContext(contexts, context);
        }
    }

    return [...contexts.values()];
}

export async function discoverChildRepositoryContexts(parentContext: RepoContext): Promise<readonly RepoContext[]> {
    return discoverNestedRepositoryContexts(parentContext.cwd, parentContext);
}

async function discoverWorkspaceRepositoryContext(cwd: string): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'])).trim();
        return root && samePath(root, cwd) ? createRepoContext(root) : undefined;
    } catch {
        return undefined;
    }
}

async function discoverNestedRepositoryContexts(workspacePath: string, workspaceContext?: RepoContext): Promise<readonly RepoContext[]> {
    const contexts: RepoContext[] = [];
    const scanRoot = workspaceContext?.cwd ?? workspacePath;
    const registeredSubmodulePathsByParentId = new Map<string, Promise<readonly string[]>>();
    const queue: Array<{
        readonly dirPath: string;
        readonly depth: number;
        readonly parentContext?: RepoContext;
    }> = [{ dirPath: scanRoot, depth: 0, parentContext: workspaceContext }];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) { break; }

        if (current.parentContext && await isRegisteredSubmodulePath(current.parentContext, current.dirPath, registeredSubmodulePathsByParentId)) {
            continue;
        }

        const isWorkspaceRepositoryRoot = workspaceContext && samePath(current.dirPath, workspaceContext.cwd);
        if (!isWorkspaceRepositoryRoot && await hasGitMarker(current.dirPath)) {
            const context = await discoverRepositoryContextAtRoot(current.dirPath, current.parentContext);
            if (context) { contexts.push(context); }
            if (current.depth >= MAX_REPOSITORY_DISCOVERY_DEPTH) { continue; }
            for (const childPath of await readableChildDirectories(current.dirPath)) {
                queue.push({ dirPath: childPath, depth: current.depth + 1, parentContext: context });
            }
            continue;
        }

        if (current.depth >= MAX_REPOSITORY_DISCOVERY_DEPTH) { continue; }

        for (const childPath of await readableChildDirectories(current.dirPath)) {
            queue.push({ dirPath: childPath, depth: current.depth + 1, parentContext: current.parentContext });
        }
    }

    return contexts;
}

async function discoverRepositoryContextAtRoot(cwd: string, parentContext: RepoContext | undefined): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'])).trim();
        return samePath(root, cwd) ? createRepoContext(root, parentContext?.id) : undefined;
    } catch {
        return undefined;
    }
}

async function isRegisteredSubmodulePath(
    parentContext: RepoContext,
    dirPath: string,
    cache: Map<string, Promise<readonly string[]>>,
): Promise<boolean> {
    const submodulePaths = await cachedRegisteredSubmodulePaths(parentContext, cache);
    return submodulePaths.some((submodulePath) => samePath(submodulePath, dirPath) || isPathInside(dirPath, submodulePath));
}

function cachedRegisteredSubmodulePaths(parentContext: RepoContext, cache: Map<string, Promise<readonly string[]>>): Promise<readonly string[]> {
    const cached = cache.get(parentContext.id);
    if (cached) { return cached; }

    const submodulePaths = registeredSubmodulePaths(parentContext.cwd);
    cache.set(parentContext.id, submodulePaths);
    return submodulePaths;
}

async function registeredSubmodulePaths(cwd: string): Promise<readonly string[]> {
    try {
        const git = new GitCliBackend(cwd);
        const output = await git.run(['config', '--file', '.gitmodules', '--null', '--name-only', '--get-regexp', '^submodule\\..*\\.path$']);
        const keys = output.split('\0').filter(Boolean);
        const submodulePaths = await Promise.all(keys.map(async (key) => (await git.run(['config', '--file', '.gitmodules', '--get', key])).trim()));
        return submodulePaths
            .filter(Boolean)
            .map((submodulePath) => path.resolve(cwd, submodulePath));
    } catch {
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

async function readableChildDirectories(dirPath: string): Promise<readonly string[]> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORY_NAMES.has(entry.name))
            .map((entry) => path.join(dirPath, entry.name))
            .sort((left, right) => left.localeCompare(right));
    } catch {
        return [];
    }
}

function addContext(contexts: Map<string, RepoContext>, context: RepoContext): void {
    contexts.set(normalizePathForComparison(context.cwd), context);
}
