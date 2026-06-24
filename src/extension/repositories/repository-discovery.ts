import * as path from 'path';
import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createRepoContext } from '@extension/repositories/repo-context-factory';

const MAX_REPOSITORY_DISCOVERY_DEPTH = 4;
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
            continue;
        }

        for (const context of await discoverNestedRepositoryContexts(folder.uri.fsPath)) {
            addContext(contexts, context);
        }
    }

    return [...contexts.values()];
}

async function discoverWorkspaceRepositoryContext(cwd: string): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'])).trim();
        return root ? createRepoContext(root) : undefined;
    } catch {
        return undefined;
    }
}

async function discoverNestedRepositoryContexts(workspacePath: string): Promise<readonly RepoContext[]> {
    const contexts: RepoContext[] = [];
    const queue: Array<{ readonly dirPath: string; readonly depth: number }> = [{ dirPath: workspacePath, depth: 0 }];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) { break; }

        if (await hasGitMarker(current.dirPath)) {
            const context = await discoverRepositoryContextAtRoot(current.dirPath);
            if (context) { contexts.push(context); }
            continue;
        }

        if (current.depth >= MAX_REPOSITORY_DISCOVERY_DEPTH) { continue; }

        for (const childPath of await readableChildDirectories(current.dirPath)) {
            queue.push({ dirPath: childPath, depth: current.depth + 1 });
        }
    }

    return contexts;
}

async function discoverRepositoryContextAtRoot(cwd: string): Promise<RepoContext | undefined> {
    try {
        const root = (await new GitCliBackend(cwd).run(['rev-parse', '--show-toplevel'])).trim();
        return samePath(root, cwd) ? createRepoContext(root) : undefined;
    } catch {
        return undefined;
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
    contexts.set(path.normalize(context.cwd), context);
}

function samePath(left: string, right: string): boolean {
    return path.normalize(left) === path.normalize(right);
}
