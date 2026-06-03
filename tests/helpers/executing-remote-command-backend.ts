import type { GitRepository } from '../../src/core/git/GitRepository';
import { CliRemoteCommandKind, VscodeRemoteCommand, type CliRemoteCommand, type RemoteCommandBackend } from '../../src/extension/git/remote-command-backend';

export const executingRemoteCommandBackend: RemoteCommandBackend = {
    async runVscode(repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
        switch (command) {
            case VscodeRemoteCommand.Fetch:
                await repo.exec(['fetch']);
                return;
            case VscodeRemoteCommand.FetchAll:
                await repo.fetchAll();
                return;
            case VscodeRemoteCommand.Pull:
                await repo.pull();
                return;
            case VscodeRemoteCommand.PullRebase:
                await repo.exec(['pull', '--rebase']);
                return;
            case VscodeRemoteCommand.Push:
                await repo.push();
                return;
            case VscodeRemoteCommand.Sync:
                await repo.pullAndPush();
                return;
            default:
                throw new Error(`No executing test backend mapping for ${command}.`);
        }
    },

    async runCli(repo: GitRepository, command: CliRemoteCommand): Promise<void> {
        switch (command.kind) {
            case CliRemoteCommandKind.Args:
                if (!command.args) { throw new Error('CLI remote command args are required.'); }
                await repo.exec(command.cwd ? ['-C', command.cwd, ...command.args] : command.args);
                return;
            case CliRemoteCommandKind.CommandLine:
                throw new Error(`The executing test backend cannot run command lines: ${command.commandLine ?? ''}`);
        }
    },
};
