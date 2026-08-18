import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { UnsupportedGitOperationError, type GitExecutionContext } from '@application/ports/git-runtime';
import type { VscodeGitApi, VscodeGitRepository } from '@extension/git/vscode-git-api';
import { VscodeGitRemoteRuntime, type VscodeCommandExecutor } from '@extension/git/vscode-git-remote-runtime';

const context = {
    cwd: '/repo',
    gitDir: '/repo/.git',
    repositoryId: 'repo',
    kind: 'main',
} satisfies GitExecutionContext;

describe('VscodeGitRemoteRuntime', () => {
    it('delegates fetch and fetch all to the VS Code Git repository', async () => {
        const repository = recordingRepository('/repo');
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await runtime.execute('fetch', context, { remote: 'origin', options: { prune: true } });
        await runtime.execute('fetchAll', context, { options: { prune: true } });

        expect(repository.fetchCalls).toEqual([
            { remote: 'origin', prune: true },
            { all: true, prune: true },
        ]);
    });

    it('delegates push variants with force metadata', async () => {
        const repository = recordingRepository('/repo', { remotes: [{ name: 'upstream' }] });
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await runtime.execute('push', context, { remote: 'origin', options: { forceWithLease: true } });
        await runtime.execute('pushBranch', context, { remote: 'upstream', branch: 'feature/auth', options: { setUpstream: true } });
        await runtime.execute('pushBranch', context, { remote: 'upstream', branch: 'feature/auth', options: { force: true } });
        await runtime.execute('forcePushWithLease', context, { remote: 'origin', branch: 'main' });

        expect(repository.pushCalls).toEqual([
            { remoteName: 'origin', branchName: undefined, setUpstream: false, force: 1 },
            { remoteName: 'upstream', branchName: 'feature/auth', setUpstream: true, force: undefined },
            { remoteName: 'upstream', branchName: 'feature/auth', setUpstream: true, force: 0 },
            { remoteName: 'origin', branchName: 'main', setUpstream: false, force: 1 },
        ]);
    });

    it('keeps plain push for the current branch when it has an upstream', async () => {
        const repository = recordingRepository('/repo', {
            HEAD: { name: 'main', upstream: { remote: 'origin', name: 'main' } },
            remotes: [{ name: 'origin' }],
        });
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await runtime.execute('push', context, { options: {} });

        expect(repository.pushCalls).toEqual([
            { remoteName: undefined, branchName: undefined, setUpstream: false, force: undefined },
        ]);
    });

    it('delegates current branch publish without upstream to VS Code publish UI', async () => {
        const repository = recordingRepository('/repo', { HEAD: { name: 'feature/auth' }, remotes: [] });
        const commandCalls: CommandCall[] = [];
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository), recordingCommandExecutor(commandCalls));

        await runtime.execute('push', context, { options: {} });

        expect(commandCalls).toEqual([{ command: 'git.publish', args: [repository] }]);
        expect(repository.pushCalls).toEqual([]);
    });

    it('publishes the exact nested repository when VS Code resolves its parent by containment', async () => {
        const parent = recordingRepository('/workspace', { HEAD: { name: 'main' }, remotes: [] });
        const child = recordingRepository('/workspace/app', { HEAD: { name: 'feature/app' }, remotes: [] });
        const commandCalls: CommandCall[] = [];
        const runtime = new VscodeGitRemoteRuntime(
            async () => containingParentGitApi(parent, child),
            recordingCommandExecutor(commandCalls),
        );

        await runtime.execute('push', nestedContext(), { options: {} });

        expect(commandCalls).toEqual([{ command: 'git.publish', args: [child] }]);
        expect(parent.pushCalls).toEqual([]);
    });

    it('routes every supported remote operation to the exact nested repository', async () => {
        const repositoryState = {
            HEAD: { name: 'feature/app', upstream: { remote: 'origin', name: 'feature/app' } },
            remotes: [{ name: 'origin' }],
        } satisfies Partial<VscodeGitRepository['state']>;
        const parent = recordingRepository('/workspace', repositoryState);
        const child = recordingRepository('/workspace/app', repositoryState);
        const runtime = new VscodeGitRemoteRuntime(async () => containingParentGitApi(parent, child));
        const childContext = nestedContext();

        await runtime.execute('fetch', childContext, { remote: 'origin', options: { prune: true } });
        await runtime.execute('fetchAll', childContext, { options: { prune: true } });
        await runtime.execute('pull', childContext, { options: {} });
        await runtime.execute('push', childContext, { remote: 'origin', options: {} });
        await runtime.execute('pushBranch', childContext, { remote: 'origin', branch: 'feature/app', options: {} });
        await runtime.execute('forcePushWithLease', childContext, { remote: 'origin', branch: 'feature/app' });

        expect(parent.fetchCalls).toEqual([]);
        expect(parent.pullCalls).toBe(0);
        expect(parent.pushCalls).toEqual([]);
        expect(child.fetchCalls).toEqual([
            { remote: 'origin', prune: true },
            { all: true, prune: true },
        ]);
        expect(child.pullCalls).toBe(1);
        expect(child.pushCalls).toHaveLength(3);
    });

    it('falls back instead of running against a containing parent when the nested repository is not open in VS Code', async () => {
        const parent = recordingRepository('/workspace', { remotes: [{ name: 'origin' }] });
        const runtime = new VscodeGitRemoteRuntime(async () => containingParentGitApi(parent));

        await expect(runtime.execute('push', nestedContext(), { remote: 'origin', options: {} }))
            .rejects.toBeInstanceOf(UnsupportedGitOperationError);
        expect(parent.pushCalls).toEqual([]);
    });

    it('resolves pushBranch remote from the current branch upstream', async () => {
        const repository = recordingRepository('/repo', {
            HEAD: { name: 'main', remote: 'upstream', upstream: { remote: 'upstream', name: 'main' } },
            remotes: [{ name: 'origin' }, { name: 'upstream' }],
        });
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await runtime.execute('pushBranch', context, { branch: 'main', options: {} });

        expect(repository.pushCalls).toEqual([
            { remoteName: 'upstream', branchName: 'main', setUpstream: false, force: undefined },
        ]);
    });

    it('resolves pushBranch remote from the single configured writable remote', async () => {
        const repository = recordingRepository('/repo', {
            HEAD: { name: 'feature/auth' },
            remotes: [{ name: 'origin' }],
        });
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await runtime.execute('pushBranch', context, { branch: 'feature/auth', options: { setUpstream: true } });

        expect(repository.pushCalls).toEqual([
            { remoteName: 'origin', branchName: 'feature/auth', setUpstream: true, force: undefined },
        ]);
    });

    it('falls back for pull rebase because the public VS Code Git API only exposes plain pull', async () => {
        const repository = recordingRepository('/repo');
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await expect(runtime.execute('pull', context, { options: { rebase: true } }))
            .rejects.toBeInstanceOf(UnsupportedGitOperationError);
        expect(repository.pullCalls).toBe(0);
    });

    it('delegates branch publish without an explicit remote to VS Code publish UI', async () => {
        const repository = recordingRepository('/repo', { HEAD: { name: 'feature/auth' }, remotes: [] });
        const commandCalls: CommandCall[] = [];
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository), recordingCommandExecutor(commandCalls));

        await runtime.execute('pushBranch', context, { branch: 'feature/auth', options: { setUpstream: true } });

        expect(commandCalls).toEqual([{ command: 'git.publish', args: [repository] }]);
        expect(repository.pushCalls).toEqual([]);
    });

    it('falls back for non-current branch publish when VS Code cannot infer the repository branch', async () => {
        const repository = recordingRepository('/repo', { HEAD: { name: 'main' }, remotes: [] });
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(repository));

        await expect(runtime.execute('pushBranch', context, { branch: 'feature/auth', options: { setUpstream: true } }))
            .rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });

    it('falls back when VS Code Git has no matching repository', async () => {
        const runtime = new VscodeGitRemoteRuntime(async () => gitApi(recordingRepository('/other')));

        await expect(runtime.execute('push', context, { remote: 'origin', options: {} }))
            .rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });
});

interface FetchCall {
    readonly remote?: string;
    readonly all?: boolean;
    readonly prune?: boolean;
}

interface PushCall {
    readonly remoteName: string | undefined;
    readonly branchName: string | undefined;
    readonly setUpstream: boolean | undefined;
    readonly force: number | undefined;
}

interface CommandCall {
    readonly command: string;
    readonly args: readonly unknown[];
}

interface RecordingRepository extends VscodeGitRepository {
    readonly fetchCalls: FetchCall[];
    readonly pushCalls: PushCall[];
    pullCalls: number;
}

function recordingRepository(rootPath: string, state: Partial<VscodeGitRepository['state']> = {}): RecordingRepository {
    return {
        rootUri: vscode.Uri.file(rootPath),
        state: {
            HEAD: state.HEAD,
            remotes: state.remotes ?? [],
        },
        fetchCalls: [],
        pushCalls: [],
        pullCalls: 0,
        async fetch(options = {}): Promise<void> {
            this.fetchCalls.push(options);
        },
        async pull(): Promise<void> {
            this.pullCalls += 1;
        },
        async push(remoteName, branchName, setUpstream, force): Promise<void> {
            this.pushCalls.push({ remoteName, branchName, setUpstream, force });
        },
    };
}

function gitApi(repository: VscodeGitRepository): VscodeGitApi {
    return {
        repositories: [repository],
        getRepository(uri): VscodeGitRepository | null {
            return uri.fsPath === repository.rootUri.fsPath ? repository : null;
        },
    };
}

function containingParentGitApi(parent: VscodeGitRepository, child?: VscodeGitRepository): VscodeGitApi {
    return {
        repositories: child ? [parent, child] : [parent],
        getRepository(): VscodeGitRepository {
            return parent;
        },
    };
}

function nestedContext(): GitExecutionContext {
    return {
        cwd: '/workspace/app',
        gitDir: '/workspace/app/.git',
        repositoryId: 'app',
        kind: 'main',
    };
}

function recordingCommandExecutor(calls: CommandCall[]): VscodeCommandExecutor {
    return <T = unknown>(command: string, ...args: readonly unknown[]): PromiseLike<T> => {
        calls.push({ command, args });
        return Promise.resolve(undefined as T); // Test executor emulates commands whose return value is intentionally ignored.
    };
}
