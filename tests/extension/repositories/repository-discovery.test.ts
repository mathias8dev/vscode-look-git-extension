import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { discoverChildRepositoryContexts, discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { Uri } from '@tests/mocks/vscode';
import { createSubmoduleFixture, createTempGitRepo, removeDirSyncWithRetry, samePath, type TempGitRepo } from '@tests/helpers/git-repo';

const repos: TempGitRepo[] = [];
const roots: string[] = [];
const cleanups: Array<() => void> = [];

describe('repository discovery', () => {
    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!(); }
        while (repos.length) { repos.pop()!.cleanup(); }
        while (roots.length) { removeDirSyncWithRetry(roots.pop()!); }
    });

    it('discovers git repositories from workspace folders with the CLI runtime', async () => {
        const repo = tempRepo();

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(repo.cwd)],
        });

        expect(contexts).toHaveLength(1);
        expect(samePath(contexts[0]?.cwd ?? '', repo.cwd)).toBe(true);
    });

    it('deduplicates workspace folders inside the same repository', async () => {
        const repo = tempRepo();
        repo.mkdir('nested');

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(repo.cwd), workspaceFolder(`${repo.cwd}/nested`)],
        });

        expect(contexts).toHaveLength(1);
        expect(samePath(contexts[0]?.cwd ?? '', repo.cwd)).toBe(true);
    });

    it('discovers sibling repositories inside a non-git workspace folder', async () => {
        const root = tempRoot();
        const api = initRepoAt(path.join(root, 'api'));
        const web = initRepoAt(path.join(root, 'web'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(root)],
        });

        const contextPaths = contexts.map((context) => context.cwd);
        expect(includesPath(contextPaths, api)).toBe(true);
        expect(includesPath(contextPaths, web)).toBe(true);
        expect(contexts).toHaveLength(2);
    });

    it('does not use an ancestor git repository when the opened workspace folder is a repository container', async () => {
        const parent = tempRepo();
        parent.mkdir('workspace');
        const api = initRepoAt(path.join(parent.cwd, 'workspace', 'api'));
        const web = initRepoAt(path.join(parent.cwd, 'workspace', 'web'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(path.join(parent.cwd, 'workspace'))],
        });

        const contextPaths = contexts.map((context) => context.cwd);
        expect(includesPath(contextPaths, parent.cwd)).toBe(false);
        expect(includesPath(contextPaths, api)).toBe(true);
        expect(includesPath(contextPaths, web)).toBe(true);
        expect(contexts).toHaveLength(2);
    });

    it('does not discover repositories beyond the filesystem depth limit', async () => {
        const root = tempRoot();
        const checkout = initRepoAt(path.join(root, 'clients', 'desktop'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(root)],
        });

        expect(contexts.some((context) => samePath(context.cwd, checkout))).toBe(false);
        expect(contexts).toHaveLength(0);
    });

    it('discovers nested repositories below a workspace repository with parent contexts', async () => {
        const parent = tempRepo();
        const child = initRepoAt(path.join(parent.cwd, 'child'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(parent.cwd)],
        });

        const parentContext = contexts.find((context) => samePath(context.cwd, parent.cwd));
        const childContext = contexts.find((context) => samePath(context.cwd, child));
        expect(parentContext).toBeDefined();
        expect(childContext).toBeDefined();
        expect(childContext?.parentId).toBe(parentContext?.id);
        expect(contexts).toHaveLength(2);
    });

    it('discovers nested repository trees one repository level at a time', async () => {
        const root = tempRoot();
        const parent = initRepoAt(path.join(root, 'parent'));
        const child = initRepoAt(path.join(parent, 'child'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(root)],
        });

        const parentContext = contexts.find((context) => samePath(context.cwd, parent));
        expect(parentContext).toBeDefined();
        expect(contexts.some((context) => samePath(context.cwd, child))).toBe(false);
        expect(contexts).toHaveLength(1);

        if (!parentContext) {
            throw new Error('Expected parent repository context.');
        }

        const childContexts = await discoverChildRepositoryContexts(parentContext);
        const childContext = childContexts.find((context) => samePath(context.cwd, child));

        expect(childContext).toBeDefined();
        expect(childContext?.parentId).toBe(parentContext.id);
        expect(childContexts).toHaveLength(1);
    });

    it('does not list registered submodules as nested repositories', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(fixture.parent.cwd)],
        });

        expect(contexts).toHaveLength(1);
        expect(samePath(contexts[0]?.cwd ?? '', fixture.parent.cwd)).toBe(true);
    });

    it('ignores dependency folders while scanning workspace repositories', async () => {
        const root = tempRoot();
        const app = initRepoAt(path.join(root, 'app'));
        initRepoAt(path.join(root, 'node_modules', 'dependency'));

        const contexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder(root)],
        });

        expect(contexts).toHaveLength(1);
        expect(samePath(contexts[0]?.cwd ?? '', app)).toBe(true);
    });
});

function tempRepo(): TempGitRepo {
    const repo = createTempGitRepo();
    repos.push(repo);
    return repo;
}

function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-discovery-'));
    roots.push(root);
    return root;
}

function initRepoAt(repoPath: string): string {
    fs.mkdirSync(repoPath, { recursive: true });
    git(repoPath, ['init', '-q']);
    git(repoPath, ['checkout', '-q', '-b', 'main']);
    return git(repoPath, ['rev-parse', '--show-toplevel']).trim();
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function includesPath(paths: readonly string[], expected: string): boolean {
    return paths.some((candidate) => samePath(candidate, expected));
}

function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
    return {
        uri: Uri.file(fsPath),
        name: 'repo',
        index: 0,
    } as unknown as vscode.WorkspaceFolder; // Partial fixture: discovery only reads uri.fsPath.
}
