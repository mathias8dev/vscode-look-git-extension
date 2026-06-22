import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Page } from '@core/git/domain/page';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitExecutionContext, GitRuntime, RepositoryKind } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { RepositorySelectionAccessor } from '@extension/repositories/repository-selection-store';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { ChangesViewProvider } from '@extension/views/changes-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';

describe('ChangesViewProvider', () => {
    beforeEach(() => {
        resetVscodeMock();
        vi.useFakeTimers();
    });

    it('does not post a refresh error while the runtime repository is not ready', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const repositories = { currentContext: context } satisfies RepositorySelectionAccessor;
        const beforeRefresh = vi.fn(async () => false);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositories,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            beforeRefresh,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(beforeRefresh).toHaveBeenCalledOnce();
        expect(view.messages).not.toContainEqual(expect.objectContaining({ type: 'changes/error' }));
        vi.clearAllTimers();
    });

    it('does not post status data again when a refresh returns the same snapshot', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, changesRuntime(statusWithUnstagedFile('src/app.ts'))),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();
        await provider.refresh();

        expect(view.messages.filter((message) => isMessageType(message, 'changes/statusData'))).toHaveLength(1);
        vi.clearAllTimers();
    });

    it('posts the current status snapshot to a newly resolved webview even when data is unchanged', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, changesRuntime(statusWithUnstagedFile('src/app.ts'))),
        );
        const firstView = makeWebviewView();
        const secondView = makeWebviewView();

        provider.resolveWebviewView(firstView);
        await provider.refresh();
        provider.resolveWebviewView(secondView);
        await provider.refresh();

        expect(firstView.messages.filter((message) => isMessageType(message, 'changes/statusData'))).toHaveLength(1);
        expect(secondView.messages.filter((message) => isMessageType(message, 'changes/statusData'))).toHaveLength(1);
        vi.clearAllTimers();
    });

    it('posts the current status snapshot again after the webview ready message', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, changesRuntime(statusWithUnstagedFile('src/app.ts'))),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();
        view.messageHandler?.({ type: 'changes/ready' });

        await vi.waitFor(() => {
            expect(view.messages.filter((message) => isMessageType(message, 'changes/statusData'))).toHaveLength(2);
        });
        vi.clearAllTimers();
    });

    it('posts status data again when a refresh returns a changed snapshot', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const runtime = sequentialChangesRuntime([
            statusWithUnstagedFile('src/app.ts'),
            statusWithUnstagedFile('src/app.ts', 'src/new-file.ts'),
        ]);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, runtime),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();
        await provider.refresh();

        expect(view.messages.filter((message) => isMessageType(message, 'changes/statusData'))).toHaveLength(2);
        vi.clearAllTimers();
    });
});

function runtimeRegistry(context: RepoContext, runtime: GitRuntime): RepositoryRegistry {
    const registry = new RepositoryRegistry();
    registry.registerRepository(new RuntimeGitRepository({
        repoId: context.id,
        cwd: context.cwd,
        gitDir: `${context.cwd}/.git`,
        kind: repositoryKindForTest(context),
        label: context.label,
    }, runtime));
    registry.registerWorktree(new RuntimeWorktree({
        repoId: context.id,
        worktreeId: context.id,
        path: context.cwd,
        gitDir: `${context.cwd}/.git`,
        repositoryKind: repositoryKindForTest(context),
        isMain: true,
        head: 'abc123',
        branch: 'main',
        dirty: true,
    }, runtime));
    return registry;
}

function repositoryKindForTest(context: RepoContext): RepositoryKind {
    return context.kind === RepoKind.Submodule ? 'submodule' : 'main';
}

function changesRuntime(status: GitStatus): GitRuntime {
    return sequentialChangesRuntime([status]);
}

function sequentialChangesRuntime(statuses: readonly GitStatus[]): GitRuntime {
    let statusIndex = 0;
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, _input: TInput): Promise<TResult> {
            if (operation === 'getStatus') {
                const status = statuses[Math.min(statusIndex, statuses.length - 1)];
                statusIndex += 1;
                return status as TResult;
            }
            if (operation === 'listStashes') { return new Page([], false) as TResult; }
            if (operation === 'listSubmodules') { return [] as TResult; }
            if (operation === 'listBranches') { return [currentBranch()] as TResult; }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function statusWithUnstagedFile(...filePaths: readonly string[]): GitStatus {
    return {
        staged: [],
        unstaged: filePaths.map((filePath) => ({ indexStatus: ' ', workTreeStatus: 'M', filePath })),
        conflicts: [],
        conflictState: 'none',
    };
}

function currentBranch(): GitBranch {
    return {
        name: 'main',
        isRemote: false,
        isCurrent: true,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
    };
}

function isMessageType(message: unknown, type: string): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === type;
}
