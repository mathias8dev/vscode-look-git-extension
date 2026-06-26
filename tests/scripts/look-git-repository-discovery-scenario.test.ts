import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { discoverChildRepositoryContexts, discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { createLookGitScenarioFixture, type LookGitScenarioFixture } from '@tests/helpers/look-git-scenario';
import { normalizePathForCompare } from '@tests/helpers/git-repo';
import { Uri } from '@tests/mocks/vscode';

const fixtures: LookGitScenarioFixture[] = [];

afterEach(() => {
    while (fixtures.length) {
        fixtures.pop()?.cleanup();
    }
});

function gitSucceeds(cwd: string, args: readonly string[]): boolean {
    try {
        execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return true;
    } catch {
        return false;
    }
}

function includesPath(paths: readonly string[], expected: string): boolean {
    const normalizedExpected = normalizePathForCompare(expected);
    return paths.some((candidate) => normalizePathForCompare(candidate) === normalizedExpected);
}

function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
    return {
        uri: Uri.file(fsPath),
        name: path.basename(fsPath),
        index: 0,
    } as unknown as vscode.WorkspaceFolder; // Partial fixture: discovery only reads uri.fsPath.
}

describe('lookGit repository-discovery setup scenario', () => {
    it('creates a non-git workspace with repositories for multi-repo navigation', async () => {
        const fixture = createLookGitScenarioFixture('repository-discovery');
        fixtures.push(fixture);

        const { repo } = fixture;
        const api = path.join(repo, 'api');
        const webClient = path.join(repo, 'web-client');
        const parent = path.join(repo, 'parent-with-modules');
        const directChild = path.join(parent, 'direct-child');
        const deepChild = path.join(parent, 'nested', 'deep-child');
        const moduleContainer = path.join(parent, 'modules');
        const moduleA = path.join(moduleContainer, 'module-a');
        const moduleB = path.join(moduleContainer, 'module-b');
        const ignoredDependency = path.join(parent, 'node_modules', 'ignored-dependency');
        const tooDeepFromRoot = path.join(repo, 'containers', 'nested', 'too-deep');

        expect(fs.existsSync(path.join(repo, 'README.md'))).toBe(true);
        expect(gitSucceeds(repo, ['rev-parse', '--show-toplevel'])).toBe(false);

        for (const repositoryPath of [api, webClient, parent, directChild, deepChild, moduleA, moduleB, ignoredDependency, tooDeepFromRoot]) {
            expect(gitSucceeds(repositoryPath, ['rev-parse', '--show-toplevel'])).toBe(true);
        }

        const rootContexts = await discoverRepositoryContexts({ workspaceFolders: [workspaceFolder(repo)] });
        const rootPaths = rootContexts.map((context) => context.cwd);
        expect(rootContexts).toHaveLength(3);
        expect(includesPath(rootPaths, api)).toBe(true);
        expect(includesPath(rootPaths, webClient)).toBe(true);
        expect(includesPath(rootPaths, parent)).toBe(true);
        expect(includesPath(rootPaths, directChild)).toBe(false);
        expect(includesPath(rootPaths, tooDeepFromRoot)).toBe(false);

        const parentContext = rootContexts.find((context) => normalizePathForCompare(context.cwd) === normalizePathForCompare(parent));
        expect(parentContext).toBeDefined();
        if (!parentContext) {
            throw new Error('Expected parent-with-modules context.');
        }

        const childContexts = await discoverChildRepositoryContexts(parentContext);
        const childPaths = childContexts.map((context) => context.cwd);
        expect(childContexts).toHaveLength(1);
        expect(includesPath(childPaths, directChild)).toBe(true);
        expect(includesPath(childPaths, deepChild)).toBe(false);
        expect(includesPath(childPaths, ignoredDependency)).toBe(false);
        expect(childContexts[0]?.parentId).toBe(parentContext.id);

        const moduleContexts = await discoverRepositoryContexts({ workspaceFolders: [workspaceFolder(moduleContainer)] });
        const modulePaths = moduleContexts.map((context) => context.cwd);
        expect(moduleContexts).toHaveLength(2);
        expect(includesPath(modulePaths, parent)).toBe(false);
        expect(includesPath(modulePaths, moduleA)).toBe(true);
        expect(includesPath(modulePaths, moduleB)).toBe(true);
    }, 120_000);
});
