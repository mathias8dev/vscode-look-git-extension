import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Page } from '@core/git/domain/page';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { CommitHistoryViewProvider } from '@extension/views/commit-history-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';
import { commands, setQuickPickValue, window } from '@tests/mocks/vscode';
import { commitContextActionIds } from '@tests/helpers/commit-context-commands';

describe('CommitHistoryViewProvider', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
        resetVscodeMock();
    });

    it('registers every history commit context action', () => {
        const provider = providerFor(historyRuntime([]));

        provider.registerNativeContextCommands();

        for (const command of commitContextActionIds('lookGit.history')) {
            expect(commands.registrations.has(command), command).toBe(true);
        }
    });

    it('navigates from the context commit while multiple commits are selected', async () => {
        const provider = providerFor(historyRuntime([]));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();
        view.messageHandler?.({
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: 'clicked',
                hashes: ['newest', 'clicked', 'oldest'],
                childHash: 'child',
                parentHash: 'parent',
                canUndoCommit: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.history.goToChildCommit');
        await vscode.commands.executeCommand('lookGit.history.goToParentCommit');

        expect(view.messages).toEqual(expect.arrayContaining([
            { type: 'history/selectCommit', hash: 'child' },
            { type: 'history/selectCommit', hash: 'parent' },
        ]));
    });

    it('executes history context commands against the complete commit selection', async () => {
        const calls: RuntimeCall[] = [];
        const provider = providerFor(historyRuntime(calls));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();
        view.messageHandler?.({
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: 'clicked',
                hashes: ['newest', 'clicked', 'oldest'],
                canUndoCommit: false,
                canCherryPick: true,
            },
        });

        await vscode.commands.executeCommand('lookGit.history.cherryPick');

        expect(calls
            .filter((call) => call.operation === 'cherryPick')
            .map((call) => isRecord(call.input) ? call.input.commit : undefined))
            .toEqual(['newest', 'clicked', 'oldest']);
    });

    it('pulls the selected non-current history branch by updating that branch ref', async () => {
        const calls: RuntimeCall[] = [];
        const provider = providerFor(historyRuntime(calls));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        setQuickPickValue('feature/topic');
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });
        await waitForSelectedFeatureBranch(calls);
        calls.length = 0;
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'pull' });

        await expect.poll(() => calls).toContainEqual(expect.objectContaining({
            operation: 'updateRef',
            input: { ref: 'refs/heads/feature/topic', newValue: 'remote-feature-head' },
        }));
        expect(calls).not.toContainEqual(expect.objectContaining({ operation: 'pull' }));
    });

    it('pushes the selected non-current history branch explicitly', async () => {
        const calls: RuntimeCall[] = [];
        const provider = providerFor(historyRuntime(calls));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        setQuickPickValue('feature/topic');
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });
        await waitForSelectedFeatureBranch(calls);
        calls.length = 0;
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'push' });

        await expect.poll(() => calls).toContainEqual(expect.objectContaining({
            operation: 'pushBranch',
            input: { remote: undefined, branch: 'feature/topic', options: {} },
        }));
        expect(calls).not.toContainEqual(expect.objectContaining({ operation: 'push' }));
    });

    it('scopes the default history load to the current branch instead of all refs', async () => {
        const calls: RuntimeCall[] = [];
        const provider = providerFor(historyRuntime(calls));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'history/ready' });

        await expect.poll(() => calls.some((call) => call.operation === 'getCommitGraph')).toBe(true);
        const graphCalls = calls.filter((call) => call.operation === 'getCommitGraph');
        for (const call of graphCalls) {
            expect(isRecord(call.input) && isRecord(call.input.query) ? call.input.query.branches : undefined).toEqual(['HEAD']);
        }
    });

    it('responds with empty history data for an initialized repository without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'repo-id',
            cwd: repo.cwd,
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = providerForUnbornContext(context);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/dataRequest', requestId: 'history-empty-main', page: { offset: 0, limit: 50 } });

        await expect.poll(() => view.messages.some((message) => isMessageType(message, 'history/dataResponse'))).toBe(true);
        expect(view.messages).toContainEqual({
            type: 'history/dataResponse',
            requestId: 'history-empty-main',
            data: {
                commits: [],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });
        expect(view.messages.some((message) => isMessageType(message, 'history/error'))).toBe(false);
    });

    it('responds with empty history data for an initialized worktree context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'worktree-id',
            cwd: repo.cwd,
            kind: RepoKind.Worktree,
            parentId: 'repo-id',
            label: 'repo-worktree',
        } satisfies RepoContext;
        const provider = providerForUnbornContext(context);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/dataRequest', requestId: 'history-empty-worktree', page: { offset: 0, limit: 50 } });

        await expect.poll(() => view.messages.some((message) => isMessageType(message, 'history/dataResponse'))).toBe(true);
        expect(view.messages).toContainEqual({
            type: 'history/dataResponse',
            requestId: 'history-empty-worktree',
            data: {
                commits: [],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });
        expect(view.messages.some((message) => isMessageType(message, 'history/error'))).toBe(false);
    });

    it('responds with empty history data for an initialized submodule context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'submodule-id',
            cwd: repo.cwd,
            kind: RepoKind.Submodule,
            parentId: 'repo-id',
            label: 'auth-kit',
        } satisfies RepoContext;
        const provider = providerForUnbornContext(context);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/dataRequest', requestId: 'history-empty-submodule', page: { offset: 0, limit: 50 } });

        await expect.poll(() => view.messages.some((message) => isMessageType(message, 'history/dataResponse'))).toBe(true);
        expect(view.messages).toContainEqual({
            type: 'history/dataResponse',
            requestId: 'history-empty-submodule',
            data: {
                commits: [],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });
        expect(view.messages.some((message) => isMessageType(message, 'history/error'))).toBe(false);
    });

    it('routes repository navigation messages through the navigation callback', async () => {
        const onRepositoryNavigation = vi.fn(async () => {});
        const context = repoContext();
        const provider = new CommitHistoryViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context },
            async () => {},
            undefined,
            undefined,
            runtimeRegistry(context, historyRuntime([])),
            onRepositoryNavigation,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'repo/navigateRepository', contextId: 'repo-child' });

        await expect.poll(() => onRepositoryNavigation.mock.calls.length).toBe(1);
        expect(onRepositoryNavigation).toHaveBeenCalledWith({ type: 'repo/navigateRepository', contextId: 'repo-child' });
    });

    it('keeps file history panels alive while hidden so pending commit details can resolve', async () => {
        const provider = providerFor(historyRuntime([]));

        await provider.showFileHistory(vscode.Uri.file('/repo/src/app.ts'));

        const panel = window.webviewPanels.find((candidate) => candidate.viewType === 'lookGit.fileHistory');
        expect(panel).toBeDefined();
        expect(isRecord(panel?.options) && panel.options.retainContextWhenHidden).toBe(true);
    });
});

interface RuntimeCall {
    readonly operation: SemanticGitOperation;
    readonly context: GitExecutionContext;
    readonly input: unknown;
}

function providerFor(runtime: GitRuntime): CommitHistoryViewProvider {
    const context = repoContext();
    return new CommitHistoryViewProvider(
        vscode.Uri.file('/extension'),
        { currentContext: context },
        async () => {},
        undefined,
        undefined,
        runtimeRegistry(context, runtime),
    );
}

function providerForUnbornContext(context: RepoContext): CommitHistoryViewProvider {
    const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
    return new CommitHistoryViewProvider(
        vscode.Uri.file('/extension'),
        { currentContext: context },
        async () => {},
        undefined,
        undefined,
        runtimeRegistryForUnbornContext(context, runtime),
    );
}

function repoContext(): RepoContext {
    return {
        id: 'repo-id',
        cwd: '/repo',
        kind: RepoKind.Main,
        label: 'repo',
    };
}

function runtimeRegistry(context: RepoContext, runtime: GitRuntime): RepositoryRegistry {
    const registry = new RepositoryRegistry();
    registry.registerRepository(new RuntimeGitRepository({
        repoId: context.id,
        cwd: context.cwd,
        gitDir: `${context.cwd}/.git`,
        kind: 'main',
        label: context.label,
    }, runtime));
    registry.registerWorktree(new RuntimeWorktree({
        repoId: context.id,
        worktreeId: context.id,
        path: context.cwd,
        gitDir: `${context.cwd}/.git`,
        repositoryKind: 'main',
        isMain: true,
        head: 'main-head',
        branch: 'main',
        dirty: false,
    }, runtime));
    return registry;
}

function runtimeRegistryForUnbornContext(context: RepoContext, runtime: GitRuntime): RepositoryRegistry {
    const registry = new RepositoryRegistry();
    const repoId = context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id;
    const repositoryKind = context.kind === RepoKind.Submodule ? 'submodule' : 'main';
    registry.registerRepository(new RuntimeGitRepository({
        repoId,
        cwd: context.cwd,
        gitDir: `${context.cwd}/.git`,
        kind: repositoryKind,
        label: context.label,
        parentRepositoryId: context.kind === RepoKind.Submodule ? context.parentId : undefined,
    }, runtime));
    registry.registerWorktree(new RuntimeWorktree({
        repoId,
        worktreeId: context.id,
        path: context.cwd,
        gitDir: `${context.cwd}/.git`,
        repositoryKind,
        parentRepositoryId: context.kind === RepoKind.Submodule ? context.parentId : undefined,
        isMain: context.kind !== RepoKind.Worktree,
        head: 'HEAD',
        branch: undefined,
        dirty: false,
    }, runtime));
    return registry;
}

function historyRuntime(calls: RuntimeCall[]): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, context: GitExecutionContext, input: TInput): Promise<TResult> {
            calls.push({ operation, context, input });
            switch (operation) {
                case 'getCommitGraph':
                    return runtimeResult(new Page([], false));
                case 'listBranches':
                    return runtimeResult(branches());
                case 'listTags':
                case 'listSubmodules':
                    return runtimeResult([]);
                case 'getReachableCommitHashes':
                    return runtimeResult(new Set<string>());
                case 'orderCommits':
                    return runtimeResult(isRecord(input) && Array.isArray(input.hashes) ? input.hashes : []);
                case 'getStatus':
                    return runtimeResult(emptyStatus());
                case 'getUpstreamBranch':
                    return runtimeResult('origin/feature/topic');
                case 'getAheadBehind':
                    return runtimeResult({ ahead: 0, behind: 1 });
                case 'resolveRef':
                    return runtimeResult('remote-feature-head');
                case 'fetchAll':
                case 'updateRef':
                case 'pushBranch':
                case 'cherryPick':
                    return runtimeResult(undefined);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function branches(): readonly GitBranch[] {
    return [
        { name: 'main', isRemote: false, isCurrent: true, hash: 'main-head', upstream: 'origin/main', ahead: 0, behind: 0 },
        { name: 'feature/topic', isRemote: false, isCurrent: false, hash: 'local-feature-head', upstream: 'origin/feature/topic', ahead: 0, behind: 1 },
        { name: 'origin/feature/topic', isRemote: true, isCurrent: false, hash: 'remote-feature-head', ahead: 0, behind: 0 },
    ];
}

function emptyStatus(): GitStatus {
    return { staged: [], unstaged: [], conflicts: [], conflictState: 'none' };
}

async function waitForSelectedFeatureBranch(calls: readonly RuntimeCall[]): Promise<void> {
    await expect.poll(() => calls.some((call) =>
        call.operation === 'getCommitGraph'
        && isRecord(call.input)
        && isRecord(call.input.query)
        && Array.isArray(call.input.query.branches)
        && call.input.query.branches.includes('feature/topic'))).toBe(true);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

function isMessageType(message: unknown, type: string): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === type;
}

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // Runtime test fixture returns values matched to each semantic operation above.
}
