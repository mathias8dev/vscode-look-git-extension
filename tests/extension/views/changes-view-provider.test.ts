import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Page } from '@core/git/domain/page';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitExecutionContext, GitRuntime, RepositoryKind } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { GitPushOutcome } from '@application/ports/git-capabilities';
import { RepositorySelectionStore, type RepositoryContextAccessor } from '@extension/repositories/repository-selection-store';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { ChangesViewProvider } from '@extension/views/changes-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';
import { setInputBoxValue } from '@tests/mocks/vscode';
import { CommitMode, RepositoryState } from '@protocol/changes/types';
import type { ChangesOperationStatusPush } from '@protocol/changes/messages';
import { OperationStatus } from '@protocol/shared/operation';

describe('ChangesViewProvider', () => {
    const repos: TempGitRepo[] = [];

    beforeEach(() => {
        resetVscodeMock();
        vi.useFakeTimers();
    });

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
        vi.clearAllTimers();
    });

    it('does not post a refresh error while the runtime repository is not ready', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const repositories = repositorySelection(context);
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
            repositorySelection(context),
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

    it('removes the activity badge after committing while the Changes view is hidden', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'app\n');
        repo.write('src/feature.ts', 'feature\n');
        const context: RepoContext = { id: 'repo-1', cwd: repo.cwd, kind: RepoKind.Main, label: 'repo' };
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'), repositorySelection(context), async () => {},
            undefined, undefined, undefined, undefined, runtimeRegistryForUnbornContext(context),
        );
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await provider.refresh();
        vi.clearAllTimers();
        expect(view.badge).toEqual({ value: 2, tooltip: '2 changes' });

        view.visible = false;
        repo.commit('feat: commit changes');
        await provider.refresh();

        expect(view.badge).toBeUndefined();
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({ staged: [], unstaged: [], conflicts: [] }),
        }));
    });

    it.each([true, false])('clears the old badge immediately when navigating to a repository: %s', async (hasRepository) => {
        const { provider, view, repositories, child } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        expect(view.badge?.value).toBe(2);

        const target = hasRepository ? child : undefined;
        repositories.selectContext(target?.id);
        provider.notifyRepoNavigationStarted(target);
        const navigatingBadge = view.badge;
        await provider.notifyRepoChanged(target);
        await provider.refresh();

        expect(navigatingBadge).toBeUndefined();
        expect(view.badge?.value).toBe(hasRepository ? 1 : undefined);
    });

    it('does not restore an old badge when an aborted read resolves after navigation starts', async () => {
        const { provider, view, repositories, child, worktree, badgeUpdates } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        badgeUpdates.length = 0;
        const started = deferredVoid();
        const release = deferredVoid();
        let signal: AbortSignal | undefined;
        vi.spyOn(worktree, 'getStatus').mockImplementationOnce(async (requestSignal) => {
            signal = requestSignal;
            started.resolve();
            await release.promise;
            return statusWithUnstagedFile('old-a.ts', 'old-b.ts', 'old-c.ts');
        });
        const refresh = provider.refresh();
        await started.promise;

        repositories.selectContext(child.id);
        provider.notifyRepoNavigationStarted(child);
        release.resolve();
        await refresh;

        expect(signal?.aborted).toBe(true);
        expect(view.badge).toBeUndefined();
        expect(badgeUpdates).not.toContainEqual(expect.objectContaining({ value: 3 }));
        expect(view.messages.some((message) => isMessageType(message, 'changes/statusData'))).toBe(false);
    });

    it.each([true, false])('ignores a late refresh failure after a context change with navigation: %s', async (announceNavigation) => {
        const { provider, view, repositories, child, worktree, badgeUpdates } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        badgeUpdates.length = 0;
        const started = deferredVoid();
        const release = deferredVoid();
        let signal: AbortSignal | undefined;
        vi.spyOn(worktree, 'getStatus').mockImplementationOnce(async (requestSignal) => {
            signal = requestSignal;
            started.resolve();
            await release.promise;
            throw new Error('The previous repository read failed.');
        });
        const refresh = provider.refresh();
        await started.promise;

        repositories.selectContext(child.id);
        if (announceNavigation) { provider.notifyRepoNavigationStarted(child); }
        await provider.notifyRepoChanged(child);
        const navigatingBadge = view.badge;
        release.resolve();
        await refresh;

        expect(signal?.aborted).toBe(true);
        expect(navigatingBadge).toBeUndefined();
        expect(view.badge).toEqual({ value: 1, tooltip: '1 change' });
        expect(badgeUpdates).not.toContainEqual(expect.objectContaining({ value: 0 }));
        expect(view.messages.some((message) => isMessageType(message, 'changes/error'))).toBe(false);
    });

    it('does not publish an outdated badge when a newer refresh cancels a read', async () => {
        const { provider, view, worktree, badgeUpdates } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        badgeUpdates.length = 0;
        const started = deferredVoid();
        const release = deferredVoid();
        vi.spyOn(worktree, 'getStatus').mockImplementationOnce(async () => {
            started.resolve();
            await release.promise;
            return statusWithUnstagedFile('old-a.ts', 'old-b.ts', 'old-c.ts');
        });
        const oldRefresh = provider.refresh();
        await started.promise;
        const newRefresh = provider.refresh();
        release.resolve();
        await oldRefresh;
        await newRefresh;

        expect(view.badge?.value).toBe(2);
        expect(badgeUpdates).not.toContainEqual(expect.objectContaining({ value: 3 }));
        expect(view.messages.some((message) => isMessageType(message, 'changes/statusData'))).toBe(false);
    });

    it('does not load another repository while an aborted readiness check finishes', async () => {
        const { provider, view, repositories, child, registry, beforeRefresh } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        const started = deferredVoid();
        const release = deferredVoid();
        beforeRefresh.mockImplementationOnce(async () => {
            started.resolve();
            await release.promise;
            return true;
        });
        const childWorktree = registry.worktrees(child.id)[0];
        if (!childWorktree) { throw new Error('Expected child worktree.'); }
        const childStatus = vi.spyOn(childWorktree, 'getStatus');
        const refresh = provider.refresh();
        await started.promise;

        repositories.selectContext(child.id);
        provider.notifyRepoNavigationStarted(child);
        release.resolve();
        await refresh;

        expect(childStatus).not.toHaveBeenCalled();
        expect(view.badge).toBeUndefined();
        expect(view.messages.some((message) => isMessageType(message, 'changes/statusData'))).toBe(false);
    });

    it('still clears the badge and reports a genuine active repository refresh failure', async () => {
        const { provider, view, worktree } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        vi.spyOn(worktree, 'getStatus').mockRejectedValueOnce(new Error('Active repository read failed.'));

        await provider.refresh();

        expect(view.badge).toBeUndefined();
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            error: expect.objectContaining({ message: 'Active repository read failed.' }),
        }));
    });

    it('does not publish a canceled squash message preset into the next repository', async () => {
        const { provider, view, repositories, child, worktree } = badgeFixture();
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        const started = deferredVoid();
        const release = deferredVoid();
        vi.spyOn(worktree, 'getSquashMergeMessage').mockImplementationOnce(async () => {
            started.resolve();
            await release.promise;
            return 'Squashed commits from the previous repository';
        });
        const refresh = provider.refresh();
        await started.promise;

        repositories.selectContext(child.id);
        provider.notifyRepoNavigationStarted(child);
        release.resolve();
        await refresh;

        expect(view.badge).toBeUndefined();
        expect(view.messages.some((message) => isMessageType(message, 'changes/commitMessagePreset'))).toBe(false);
    });

    it('hides registered nested repositories from the parent status', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const child = {
            id: 'repo-2',
            cwd: '/repo/packages/app',
            kind: RepoKind.Main,
            parentId: context.id,
            label: 'app',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context, [context, child]),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, changesRuntime({
                staged: [],
                unstaged: [
                    { indexStatus: '?', workTreeStatus: '?', filePath: 'packages/app/' },
                    { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
                ],
                conflicts: [],
                conflictState: 'none',
            })),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' }],
            }),
        }));
        vi.clearAllTimers();
    });

    it('stages visible changes without adding registered nested repositories', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const child = {
            id: 'repo-2',
            cwd: '/repo/packages/app',
            kind: RepoKind.Main,
            parentId: context.id,
            label: 'app',
        } satisfies RepoContext;
        const stagedPaths: string[][] = [];
        const operations: SemanticGitOperation[] = [];
        const status: GitStatus = {
            staged: [],
            unstaged: [
                { indexStatus: '?', workTreeStatus: '?', filePath: 'packages/app/' },
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
            ],
            conflicts: [],
            conflictState: 'none',
        };
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context, [context, child]),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, stageRecordingRuntime(status, operations, stagedPaths)),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/stageAll' });

        await vi.waitFor(() => expect(stagedPaths).toEqual([['src/app.ts']]));
        expect(operations).not.toContain('stageAll');
        vi.clearAllTimers();
    });

    it('refreshes staged status without waiting for a slow repository-wide refresh', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const stagedPaths: string[][] = [];
        const repositoryRefresh = deferredVoid();
        const onRepositoryUpdated = vi.fn(() => repositoryRefresh.promise);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            onRepositoryUpdated,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, largeStageMutationRuntime(2_443, stagedPaths)),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();
        vi.clearAllTimers();
        view.messages.length = 0;
        view.messageHandler?.({ type: 'changes/stageFile', filePath: 'src/file-0.c' });

        await vi.waitFor(() => expect(onRepositoryUpdated).toHaveBeenCalledOnce());
        expect(stagedPaths).toEqual([['src/file-0.c']]);
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({
                staged: [expect.objectContaining({ filePath: 'src/file-0.c' })],
                unstaged: expect.not.arrayContaining([expect.objectContaining({ filePath: 'src/file-0.c' })]),
            }),
        }));

        repositoryRefresh.resolve();
        vi.clearAllTimers();
    });

    it('discards visible changes without deleting registered nested repositories', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const child = {
            id: 'repo-2',
            cwd: '/repo/packages/app',
            kind: RepoKind.Main,
            parentId: context.id,
            label: 'app',
        } satisfies RepoContext;
        const discardedPaths: string[][] = [];
        const status: GitStatus = {
            staged: [],
            unstaged: [
                { indexStatus: '?', workTreeStatus: '?', filePath: 'packages/app/' },
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
            ],
            conflicts: [],
            conflictState: 'none',
        };
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context, [context, child]),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, discardRecordingRuntime(status, discardedPaths)),
        );
        const view = makeWebviewView();
        setInputBoxValue('DISCARD ALL');

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardAll' });

        await vi.waitFor(() => expect(discardedPaths).toEqual([['src/app.ts']]));
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
            repositorySelection(context),
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
            repositorySelection(context),
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
            repositorySelection(context),
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

    it('posts a commit message preset when git has a squash merge message', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, changesRuntime(statusWithStagedFile('src/app.ts'), 'Squashed commit of the following:\n\ncommit abc123')),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();
        await provider.refresh();

        expect(view.messages.filter((message) => isMessageType(message, 'changes/commitMessagePreset'))).toEqual([
            {
                type: 'changes/commitMessagePreset',
                presetId: 'squash-merge-1',
                message: 'Squashed commit of the following:\n\ncommit abc123',
            },
        ]);
        vi.clearAllTimers();
    });

    it('posts empty available status data for an initialized repository without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'repo-id',
            cwd: repo.cwd,
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistryForUnbornContext(context),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).toContainEqual({
            type: 'changes/statusData',
            data: expect.objectContaining({
                repositoryState: RepositoryState.Available,
                staged: [],
                unstaged: [],
                conflicts: [],
                stashes: [],
                submodules: [],
            }),
        });
        expect(view.messages.some((message) => isMessageType(message, 'changes/error'))).toBe(false);
        vi.clearAllTimers();
    });

    it('notifies the repository refresh coordinator after a commit', async () => {
        const context = {
            id: 'repo-id',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const onRepositoryUpdated = vi.fn(async () => {});
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            onRepositoryUpdated,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, commitChangesRuntime()),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/commit', message: 'feat: commit', mode: CommitMode.Commit });

        await vi.waitFor(() => {
            expect(onRepositoryUpdated).toHaveBeenCalledOnce();
        });
        vi.clearAllTimers();
    });

    it('posts empty available status data for an initialized worktree context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'worktree-id',
            cwd: repo.cwd,
            kind: RepoKind.Worktree,
            parentId: 'repo-id',
            label: 'repo-worktree',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistryForUnbornContext(context),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).toContainEqual({
            type: 'changes/statusData',
            data: expect.objectContaining({
                repositoryState: RepositoryState.Available,
                staged: [],
                unstaged: [],
                conflicts: [],
                stashes: [],
                submodules: [],
            }),
        });
        expect(view.messages.some((message) => isMessageType(message, 'changes/error'))).toBe(false);
        vi.clearAllTimers();
    });

    it('posts empty available status data for an initialized submodule context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'submodule-id',
            cwd: repo.cwd,
            kind: RepoKind.Submodule,
            parentId: 'repo-id',
            label: 'auth-kit',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistryForUnbornContext(context),
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).toContainEqual({
            type: 'changes/statusData',
            data: expect.objectContaining({
                repositoryState: RepositoryState.Available,
                staged: [],
                unstaged: [],
                conflicts: [],
                stashes: [],
                submodules: [],
            }),
        });
        expect(view.messages.some((message) => isMessageType(message, 'changes/error'))).toBe(false);
        vi.clearAllTimers();
    });

    it('routes repository navigation messages through the navigation callback', async () => {
        const onRepositoryNavigation = vi.fn(async () => {});
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(undefined),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            async () => true,
            onRepositoryNavigation,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'repo/navigateRepository', contextId: 'repo-2' });

        await vi.waitFor(() => {
            expect(onRepositoryNavigation).toHaveBeenCalledWith({ type: 'repo/navigateRepository', contextId: 'repo-2' });
        });
        vi.clearAllTimers();
    });

    it('announces navigation immediately without refreshing the unprepared repository', async () => {
        const context = {
            id: 'repo-2',
            cwd: '/repo-2',
            kind: RepoKind.Main,
            label: 'repo-2',
        } satisfies RepoContext;
        const beforeRefresh = vi.fn(async () => false);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
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
        view.messages.length = 0;

        provider.notifyRepoNavigationStarted(context);
        await vi.advanceTimersByTimeAsync(100);

        expect(view.messages).toEqual([{
            type: 'repo/navigationStarted',
            context: { id: 'repo-2', cwd: '/repo-2', kind: 'main', label: 'repo-2' },
        }]);
        expect(beforeRefresh).not.toHaveBeenCalled();
    });

    it('replays pending navigation when the Changes webview becomes ready', async () => {
        const context = {
            id: 'repo-2',
            cwd: '/repo-2',
            kind: RepoKind.Main,
            label: 'repo-2',
        } satisfies RepoContext;
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            async () => false,
        );
        provider.notifyRepoNavigationStarted(context);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/ready' });

        expect(view.messages).toContainEqual(expect.objectContaining({ type: 'repo/navigationStarted' }));
        expect(view.messages.some((message) => isMessageType(message, 'changes/statusData'))).toBe(false);
    });

    it('does not report success or refresh when native publication is delegated', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo-1',
            kind: RepoKind.Main,
            label: 'repo-1',
        } satisfies RepoContext;
        const onRepositoryUpdated = vi.fn(async () => {});
        const runtime = pushRuntime(GitPushOutcome.Delegated);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            onRepositoryUpdated,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, runtime),
        );
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();

        await vscode.commands.executeCommand('lookGit.changes.push');

        expect(view.messages
            .filter(isChangesOperationStatusMessage)
            .map((message) => message.status))
            .toEqual([OperationStatus.Running, OperationStatus.Delegated]);
        expect(onRepositoryUpdated).not.toHaveBeenCalled();
    });

    it('reports success and refreshes after a completed push', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo-1',
            kind: RepoKind.Main,
            label: 'repo-1',
        } satisfies RepoContext;
        const onRepositoryUpdated = vi.fn(async () => {});
        const runtime = pushRuntime(GitPushOutcome.Completed);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositorySelection(context),
            onRepositoryUpdated,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry(context, runtime),
        );
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();

        await vscode.commands.executeCommand('lookGit.changes.push');

        expect(view.messages
            .filter(isChangesOperationStatusMessage)
            .map((message) => message.status))
            .toEqual([OperationStatus.Running, OperationStatus.Success]);
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
    });
});

function repositorySelection(
    currentContext: RepoContext | undefined,
    contexts: readonly RepoContext[] = currentContext ? [currentContext] : [],
): RepositoryContextAccessor {
    return { currentContext, contexts };
}

function runtimeRegistry(context: RepoContext, runtime: GitRuntime, registry = new RepositoryRegistry()): RepositoryRegistry {
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

function badgeFixture() {
    const context: RepoContext = { id: 'repo-1', cwd: '/repo', kind: RepoKind.Main, label: 'repo' };
    const child: RepoContext = { id: 'repo-2', cwd: '/repo/modules/child', kind: RepoKind.Submodule, parentId: context.id, label: 'child' };
    const repositories = new RepositorySelectionStore();
    repositories.setContexts([context, child]);
    repositories.selectContext(context.id);
    const registry = runtimeRegistry(context, changesRuntime(statusWithUnstagedFile('src/app.ts', 'src/feature.ts')));
    runtimeRegistry(child, changesRuntime(statusWithUnstagedFile('src/child.ts')), registry);
    const worktree = registry.worktrees(context.id)[0];
    if (!worktree) { throw new Error('Expected parent worktree.'); }
    const beforeRefresh = vi.fn(async () => true);
    const provider = new ChangesViewProvider(
        vscode.Uri.file('/extension'), repositories, async () => {},
        undefined, undefined, undefined, undefined, registry, undefined, beforeRefresh,
    );
    const view = makeWebviewView();
    const badgeUpdates: (vscode.ViewBadge | undefined)[] = [];
    let badge = view.badge;
    Object.defineProperty(view, 'badge', {
        get: () => badge,
        set: (value: vscode.ViewBadge | undefined) => { badge = value; badgeUpdates.push(value); },
    });
    provider.resolveWebviewView(view);
    return { provider, view, repositories, context, child, worktree, registry, beforeRefresh, badgeUpdates };
}

function runtimeRegistryForUnbornContext(context: RepoContext): RepositoryRegistry {
    const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
    const registry = new RepositoryRegistry();
    const repoId = context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id;
    const repositoryKind = repositoryKindForTest(context);
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

function pushRuntime(outcome: GitPushOutcome): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, _input: TInput): Promise<TResult> {
            if (operation === 'push') {
                return outcome as TResult; // The fixture returns the result defined by this semantic operation.
            }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function repositoryKindForTest(context: RepoContext): RepositoryKind {
    return context.kind === RepoKind.Submodule ? 'submodule' : 'main';
}

function changesRuntime(status: GitStatus, squashMergeMessage?: string): GitRuntime {
    return sequentialChangesRuntime([status], squashMergeMessage);
}

function sequentialChangesRuntime(statuses: readonly GitStatus[], squashMergeMessage?: string): GitRuntime {
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
            if (operation === 'getSquashMergeMessage') { return squashMergeMessage as TResult; }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function commitChangesRuntime(): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, _input: TInput): Promise<TResult> {
            if (operation === 'commit') { return undefined as TResult; }
            if (operation === 'getStatus') { return statusWithStagedFile('src/app.ts') as TResult; }
            if (operation === 'listStashes') { return new Page([], false) as TResult; }
            if (operation === 'listSubmodules') { return [] as TResult; }
            if (operation === 'listBranches') { return [currentBranch()] as TResult; }
            if (operation === 'getSquashMergeMessage') { return undefined as TResult; }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function stageRecordingRuntime(
    status: GitStatus,
    operations: SemanticGitOperation[],
    stagedPaths: string[][],
): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, input: TInput): Promise<TResult> {
            operations.push(operation);
            if (operation === 'getStatus') { return status as TResult; }
            if (operation === 'stage') {
                if (!input || typeof input !== 'object' || !('paths' in input) || !Array.isArray(input.paths)) {
                    throw new Error('Expected stage paths.');
                }
                stagedPaths.push(input.paths.filter((filePath): filePath is string => typeof filePath === 'string'));
                return undefined as TResult;
            }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function largeStageMutationRuntime(fileCount: number, stagedPaths: string[][]): GitRuntime {
    let status = statusWithUnstagedFile(...Array.from({ length: fileCount }, (_, index) => `src/file-${index}.c`));
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, input: TInput): Promise<TResult> {
            if (operation === 'getStatus') { return status as TResult; }
            if (operation === 'listStashes') { return new Page([], false) as TResult; }
            if (operation === 'listSubmodules') { return [] as TResult; }
            if (operation === 'listBranches') { return [currentBranch()] as TResult; }
            if (operation === 'getSquashMergeMessage') { return undefined as TResult; }
            if (operation === 'stage') {
                if (!input || typeof input !== 'object' || !('paths' in input) || !Array.isArray(input.paths)) {
                    throw new Error('Expected stage paths.');
                }
                const paths = input.paths.filter((filePath): filePath is string => typeof filePath === 'string');
                const pathSet = new Set(paths);
                stagedPaths.push(paths);
                status = {
                    ...status,
                    staged: [
                        ...status.staged,
                        ...status.unstaged
                            .filter((entry) => pathSet.has(entry.filePath))
                            .map((entry) => ({ ...entry, indexStatus: 'M', workTreeStatus: ' ' })),
                    ],
                    unstaged: status.unstaged.filter((entry) => !pathSet.has(entry.filePath)),
                };
                return undefined as TResult;
            }
            throw new Error(`Unexpected operation ${operation}`);
        },
    };
}

function deferredVoid(): { readonly promise: Promise<void>; resolve(): void } {
    let resolvePromise = (): void => {};
    const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
    return { promise, resolve: resolvePromise };
}

function discardRecordingRuntime(status: GitStatus, discardedPaths: string[][]): GitRuntime {
    return {
        supports: () => true,
        async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, _context: GitExecutionContext, input: TInput): Promise<TResult> {
            if (operation === 'unstageAll') { return undefined as TResult; }
            if (operation === 'getStatus') { return status as TResult; }
            if (operation === 'discard') {
                if (!input || typeof input !== 'object' || !('paths' in input) || !Array.isArray(input.paths)) {
                    throw new Error('Expected discard paths.');
                }
                discardedPaths.push(input.paths.filter((filePath): filePath is string => typeof filePath === 'string'));
                return undefined as TResult;
            }
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

function statusWithStagedFile(...filePaths: readonly string[]): GitStatus {
    return {
        staged: filePaths.map((filePath) => ({ indexStatus: 'A', workTreeStatus: ' ', filePath })),
        unstaged: [],
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

function isChangesOperationStatusMessage(message: unknown): message is ChangesOperationStatusPush {
    return isMessageType(message, 'changes/operationStatus');
}
