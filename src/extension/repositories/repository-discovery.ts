import * as path from 'path';
import type * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createRepoContext } from '@extension/repositories/repo-context-factory';

export interface RepositoryDiscoveryInput {
    readonly workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
}

export async function discoverRepositoryContexts(input: RepositoryDiscoveryInput): Promise<readonly RepoContext[]> {
    const contexts = new Map<string, RepoContext>();

    const workspaceContexts = await Promise.all((input.workspaceFolders ?? [])
        .map((folder) => discoverWorkspaceRepositoryContext(folder.uri.fsPath)));
    for (const context of workspaceContexts) {
        if (context) { addContext(contexts, context); }
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

function addContext(contexts: Map<string, RepoContext>, context: RepoContext): void {
    contexts.set(path.normalize(context.cwd), context);
}
