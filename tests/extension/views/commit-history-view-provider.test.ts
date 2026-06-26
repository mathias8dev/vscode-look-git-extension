import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Page } from '@core/git/domain/page';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { CommitHistoryViewProvider } from '@extension/views/commit-history-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';
import { setQuickPickValue } from '@tests/mocks/vscode';

describe('CommitHistoryViewProvider', () => {
    afterEach(() => {
        resetVscodeMock();
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
        view.messageHandler?.({ type: 'repo/showRepositoryList', contextId: 'repo-child' });

        await expect.poll(() => onRepositoryNavigation.mock.calls.length).toBe(1);
        expect(onRepositoryNavigation).toHaveBeenCalledWith({ type: 'repo/showRepositoryList', contextId: 'repo-child' });
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

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // Runtime test fixture returns values matched to each semantic operation above.
}
