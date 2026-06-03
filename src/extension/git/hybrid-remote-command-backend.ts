import type { GitRepository } from '../../application/ports/git-repository';
import { CliRemoteCommandBackend } from './cli-remote-command-backend';
import type { CliRemoteCommand, RemoteCommandBackend, VscodeRemoteCommand } from '../../application/ports/remote-command-backend';
import { VscodeRemoteCommandBackend } from './vscode-remote-command-backend';

export class HybridRemoteCommandBackend implements RemoteCommandBackend {
    constructor(
        private readonly vscodeRemote = new VscodeRemoteCommandBackend(),
        private readonly cliRemote = new CliRemoteCommandBackend(),
    ) {}

    runVscode(repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
        return this.vscodeRemote.run(repo, command);
    }

    runCli(repo: GitRepository, command: CliRemoteCommand): Promise<void> {
        return this.cliRemote.run(repo, command);
    }
}

export const defaultRemoteCommandBackend: RemoteCommandBackend = new HybridRemoteCommandBackend();
