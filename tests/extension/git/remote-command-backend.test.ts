import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliRemoteCommandBackend } from '../../../src/extension/git/cli-remote-command-backend';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { VscodeRemoteCommandBackend } from '../../../src/extension/git/vscode-remote-command-backend';
import { CliRemoteCommandKind, VscodeRemoteCommand } from '../../../src/application/ports/remote-command-backend';
import { makeRepositoryMock } from '../../helpers/repositoryMock';
import { createBareGitRepo, createTempGitRepo, type TempGitRepo } from '../../helpers/gitRepo';
import { commands, resetMockVscode, setBuiltInGitApi, Uri, window } from '../../mocks/vscode';

describe('remote command backends', () => {
    const repos: TempGitRepo[] = [];

    beforeEach(resetMockVscode);

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

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

    it('publishes the current branch when Push has no configured upstream', async () => {
        const vscodeRepo = vscodeGitRepo('/repo');
        const repo = makeRepositoryMock({
            cwd: '/repo',
            getCurrentBranch: vi.fn(async () => 'topic'),
            getAllBranches: vi.fn(async () => [
                { name: 'topic', isRemote: false, isCurrent: true, hash: 'topic-head', upstream: undefined, ahead: 0, behind: 0 },
            ]),
        });
        setBuiltInGitApi(vscodeGitApi([vscodeRepo.repository]));
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(repo, VscodeRemoteCommand.Push);

        expect(vscodeRepo.push).not.toHaveBeenCalled();
        expect(commands.calls).toEqual([
            { command: 'git.publish', args: [vscodeRepo.repository] },
        ]);
    });

    it('keeps using Push when the current branch has a configured upstream', async () => {
        const vscodeRepo = vscodeGitRepo('/repo');
        const repo = makeRepositoryMock({
            cwd: '/repo',
            getCurrentBranch: vi.fn(async () => 'topic'),
            getAllBranches: vi.fn(async () => [
                { name: 'topic', isRemote: false, isCurrent: true, hash: 'topic-head', upstream: 'origin/topic', ahead: 1, behind: 0 },
            ]),
        });
        setBuiltInGitApi(vscodeGitApi([vscodeRepo.repository]));
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(repo, VscodeRemoteCommand.Push);

        expect(vscodeRepo.push).toHaveBeenCalledWith();
        expect(commands.calls).toEqual([]);
    });

    it('publishes the current branch when Sync has no configured upstream', async () => {
        const repo = makeRepositoryMock({
            getCurrentBranch: vi.fn(async () => 'topic'),
            getAllBranches: vi.fn(async () => [
                { name: 'topic', isRemote: false, isCurrent: true, hash: 'topic-head', upstream: undefined, ahead: 0, behind: 0 },
            ]),
        });
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(repo, VscodeRemoteCommand.Sync);

        expect(commands.calls).toEqual([
            { command: 'git.publish', args: [] },
        ]);
    });

    it('detects an unpublished current branch from a real repository', async () => {
        const local = track(createTempGitRepo(), repos);
        const remote = track(createBareGitRepo(), repos);
        local.commitFile('base.txt', 'base\n', 'feat: base');
        local.git(['remote', 'add', 'origin', remote.cwd]);
        local.git(['checkout', '-q', '-b', 'topic']);
        local.commitFile('topic.txt', 'topic\n', 'feat: topic');
        const backend = new VscodeRemoteCommandBackend();

        await backend.run(new GitProcessRepository(local.cwd), VscodeRemoteCommand.Push);

        expect(commands.calls).toEqual([
            { command: 'git.publish', args: [] },
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

function track(repo: TempGitRepo, repos: TempGitRepo[]): TempGitRepo {
    repos.push(repo);
    return repo;
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
