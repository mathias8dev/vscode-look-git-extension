import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliRemoteCommandBackend } from '../../../src/extension/git/cli-remote-command-backend';
import { VscodeRemoteCommandBackend } from '../../../src/extension/git/vscode-remote-command-backend';
import { CliRemoteCommandKind, VscodeRemoteCommand } from '../../../src/application/ports/remote-command-backend';
import { makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, resetMockVscode, setBuiltInGitApi, Uri, window } from '../../mocks/vscode';

describe('remote command backends', () => {
    beforeEach(resetMockVscode);

    it('falls back to built-in Git command ids when the VS Code Git API is unavailable', async () => {
        const repo = makeRepositoryMock();
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(repo, VscodeRemoteCommand.FetchAll);
        await backend.run(repo, VscodeRemoteCommand.Push);

        expect(commands.calls).toEqual([
            { command: 'git.fetchAll', args: [] },
            { command: 'git.push', args: [] },
        ]);
    });

    it('runs simple VS Code Git remote commands against the repository matching cwd', async () => {
        const main = vscodeGitRepo('/repo');
        const submodule = vscodeGitRepo('/repo/modules/auth-kit');
        setBuiltInGitApi(vscodeGitApi([main.repository, submodule.repository]));
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(makeRepositoryMock({ cwd: '/repo/modules/auth-kit' }), VscodeRemoteCommand.FetchAll);
        await backend.run(makeRepositoryMock({ cwd: '/repo/modules/auth-kit' }), VscodeRemoteCommand.Push);

        expect(main.fetch).not.toHaveBeenCalled();
        expect(main.push).not.toHaveBeenCalled();
        expect(submodule.fetch).toHaveBeenCalledWith({ all: true });
        expect(submodule.push).toHaveBeenCalledWith();
        expect(commands.calls).toEqual([]);
    });

    it('passes the resolved repository to VS Code Git UI workflows', async () => {
        const submodule = vscodeGitRepo('/repo/modules/auth-kit');
        setBuiltInGitApi(vscodeGitApi([submodule.repository]));
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(makeRepositoryMock({ cwd: '/repo/modules/auth-kit' }), VscodeRemoteCommand.PullFrom);

        expect(commands.calls).toEqual([
            { command: 'git.pullFrom', args: [submodule.repository] },
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

function vscodeGitRepo(root: string) {
    const fetch = vi.fn(async () => undefined);
    const pull = vi.fn(async () => undefined);
    const push = vi.fn(async () => undefined);
    return {
        repository: {
            rootUri: Uri.file(root),
            fetch,
            pull,
            push,
        },
        fetch,
        pull,
        push,
    };
}

function vscodeGitApi(repositories: readonly ReturnType<typeof vscodeGitRepo>['repository'][]) {
    return {
        repositories,
        getRepository(uri: { readonly fsPath: string }) {
            return repositories.find((repo) => repo.rootUri.fsPath === uri.fsPath) ?? null;
        },
        openRepository: vi.fn(async () => null),
    };
}
