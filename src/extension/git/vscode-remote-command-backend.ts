import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../application/ports/git-repository';
import { VscodeRemoteCommand as RemoteCommand, type VscodeRemoteCommand, type VscodeRemoteCommandRunner } from '../../application/ports/remote-command-backend';
import type { API, Repository } from '../../types/git';
import { getBuiltInGitApi } from '../utils/gitExtension';

const FORCE_PUSH_MODE: Parameters<Repository['push']>[3] = 0;

export class VscodeRemoteCommandBackend implements VscodeRemoteCommandRunner {
    async run(repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
        const api = await getBuiltInGitApi();
        if (!api) {
            await vscode.commands.executeCommand(vscodeGitCommandId(command));
            return;
        }

        const vscodeRepo = await resolveVscodeRepository(api, repo.cwd);
        if (!vscodeRepo) {
            throw new Error(`VS Code Git does not know repository "${repo.cwd}".`);
        }

        if (await runRepositoryCommand(vscodeRepo, command)) { return; }
        await vscode.commands.executeCommand(vscodeGitCommandId(command), vscodeRepo);
    }
}

async function runRepositoryCommand(repo: Repository, command: VscodeRemoteCommand): Promise<boolean> {
    switch (command) {
        case RemoteCommand.Fetch:
            await repo.fetch();
            return true;
        case RemoteCommand.FetchAll:
            await repo.fetch({ all: true });
            return true;
        case RemoteCommand.FetchPrune:
            await repo.fetch({ prune: true });
            return true;
        case RemoteCommand.Pull:
            await repo.pull();
            return true;
        case RemoteCommand.Push:
            await repo.push();
            return true;
        case RemoteCommand.PushForce:
            await repo.push(undefined, undefined, false, FORCE_PUSH_MODE);
            return true;
        case RemoteCommand.Sync:
            await repo.pull();
            await repo.push();
            return true;
        case RemoteCommand.PullRebase:
        case RemoteCommand.PullFrom:
        case RemoteCommand.PushTo:
        case RemoteCommand.PushToForce:
        case RemoteCommand.PushTags:
        case RemoteCommand.SyncRebase:
        case RemoteCommand.Publish:
        case RemoteCommand.DeleteRemoteBranch:
        case RemoteCommand.DeleteRemoteTag:
            return false;
    }
}

async function resolveVscodeRepository(api: API, cwd: string): Promise<Repository | undefined> {
    const uri = vscode.Uri.file(cwd);
    const known = api.getRepository(uri) ?? api.repositories.find((repo) => samePath(repo.rootUri.fsPath, cwd));
    if (known) { return known; }
    return await api.openRepository(uri) ?? undefined;
}

function samePath(a: string, b: string): boolean {
    const left = normalizePath(a);
    const right = normalizePath(b);
    return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function normalizePath(value: string): string {
    return path.resolve(value);
}

function vscodeGitCommandId(command: VscodeRemoteCommand): string {
    return `git.${command}`;
}
