import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import type { VscodeRemoteCommand, VscodeRemoteCommandRunner } from '../../application/ports/remote-command-backend';

export class VscodeRemoteCommandBackend implements VscodeRemoteCommandRunner {
    async run(_repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
        await vscode.commands.executeCommand(vscodeGitCommandId(command));
    }
}

function vscodeGitCommandId(command: VscodeRemoteCommand): string {
    return `git.${command}`;
}
