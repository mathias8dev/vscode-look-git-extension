import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { Uri } from '@tests/mocks/vscode';
import { createTempGitRepo, samePath, type TempGitRepo } from '@tests/helpers/git-repo';

const repos: TempGitRepo[] = [];

describe('repository discovery', () => {
    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
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
});

function tempRepo(): TempGitRepo {
    const repo = createTempGitRepo();
    repos.push(repo);
    return repo;
}

function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
    return {
        uri: Uri.file(fsPath),
        name: 'repo',
        index: 0,
    } as unknown as vscode.WorkspaceFolder; // Partial fixture: discovery only reads uri.fsPath.
}
