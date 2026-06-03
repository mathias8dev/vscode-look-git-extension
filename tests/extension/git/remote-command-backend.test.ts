import { beforeEach, describe, expect, it } from 'vitest';
import { CliRemoteCommandBackend } from '../../../src/extension/git/cli-remote-command-backend';
import { VscodeRemoteCommandBackend } from '../../../src/extension/git/vscode-remote-command-backend';
import { CliRemoteCommandKind, VscodeRemoteCommand } from '../../../src/extension/git/remote-command-backend';
import { makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, resetMockVscode, window } from '../../mocks/vscode';

describe('remote command backends', () => {
    beforeEach(resetMockVscode);

    it('maps VS Code remote commands to built-in Git command ids', async () => {
        const repo = makeRepositoryMock();
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(repo, VscodeRemoteCommand.FetchAll);
        await backend.run(repo, VscodeRemoteCommand.Push);

        expect(commands.calls).toEqual([
            { command: 'git.fetchAll', args: [] },
            { command: 'git.push', args: [] },
        ]);
    });

    it('opens CLI argument commands in an integrated terminal with shell quoting', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });
        const backend = new CliRemoteCommandBackend();

        await backend.run(repo, {
            kind: CliRemoteCommandKind.Args,
            args: ['push', 'origin', "feature/it's-ok:refs/heads/topic"],
            title: 'Look Git Remote: topic',
        });

        expect(window.terminals).toEqual([expect.objectContaining({
            name: 'Look Git Remote: topic',
            cwd: '/repo',
            hideFromUser: true,
            isTransient: true,
            texts: ["git 'push' 'origin' 'feature/it'\\''s-ok:refs/heads/topic'"],
            visible: false,
        })]);
    });

    it('opens exact CLI command lines in the requested working directory', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });
        const backend = new CliRemoteCommandBackend();

        await backend.run(repo, {
            kind: CliRemoteCommandKind.CommandLine,
            cwd: '/repo/modules/auth-kit',
            commandLine: 'git pull --rebase && git push',
            title: 'Look Git Remote: modules/auth-kit',
        });

        expect(window.terminals).toEqual([expect.objectContaining({
            name: 'Look Git Remote: modules/auth-kit',
            cwd: '/repo/modules/auth-kit',
            hideFromUser: true,
            isTransient: true,
            texts: ['git pull --rebase && git push'],
            visible: false,
        })]);
    });
});
