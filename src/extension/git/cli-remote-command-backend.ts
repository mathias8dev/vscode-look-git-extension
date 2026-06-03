import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import { CliRemoteCommandKind, type CliRemoteCommand, type CliRemoteCommandRunner } from '../../application/ports/remote-command-backend';

export class CliRemoteCommandBackend implements CliRemoteCommandRunner {
    async run(repo: GitRepository, command: CliRemoteCommand): Promise<void> {
        const terminal = vscode.window.createTerminal({
            name: command.title ?? 'Look Git Remote',
            cwd: command.cwd ?? repo.cwd,
            hideFromUser: true,
            isTransient: true,
        });
        terminal.sendText(commandText(command));
    }
}

function commandText(command: CliRemoteCommand): string {
    switch (command.kind) {
        case CliRemoteCommandKind.Args:
            if (!command.args) { throw new Error('CLI remote command args are required.'); }
            return gitCommandLine(command.args);
        case CliRemoteCommandKind.CommandLine:
            if (!command.commandLine) { throw new Error('CLI remote command line is required.'); }
            return command.commandLine;
    }
}

function gitCommandLine(args: readonly string[]): string {
    return ['git', ...args.map(shellQuote)].join(' ');
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
