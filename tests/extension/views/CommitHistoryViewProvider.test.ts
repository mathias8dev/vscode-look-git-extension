import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitFileChange } from '../../../src/application/ports/git-repository';
import { RepoKind } from '../../../src/core/git/domain/RepoContext';
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, getCommandCalls, setQuickPickValue, workspace } from '../../mocks/vscode';

describe('CommitHistoryViewProvider error propagation', () => {
    beforeEach(resetVscodeMock);

    it('posts configured font size updates without reloading the history webview', () => {
        workspace.values.set('lookGit.fontSize', 23);
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        const initialHtml = view.webview.html;
        workspace.values.set('lookGit.fontSize', 24);
        view.messages = [];
        provider.notifyFontSizeChanged();

        expect(view.messages).toContainEqual({ type: 'ui/fontSizeChanged', fontSize: 24 });
        expect(view.webview.html).toBe(initialHtml);
    });

    it('posts mapped paginated commit history data on refresh', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => [
                commit('abc123456789', 'feat: history'),
                commit('def123456789', 'fix: second'),
            ]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/data',
            data: {
                commits: [{
                    hash: 'abc123456789',
                    shortHash: 'abc1234',
                    message: 'feat: history',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'fix: second',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                }],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        }));
        expect(repo.getLog).toHaveBeenCalledWith(51, 0);
    });

    it('adds local remote and tag refs to commits', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => [
                commit('abc123456789', 'feat: history refs'),
                commit('def123456789', 'fix: no refs'),
            ]),
            getAllBranches: vi.fn(async () => [
                { name: 'experimental', isRemote: false, isCurrent: true, hash: 'abc1234', ahead: 0, behind: 0 },
                { name: 'origin/experimental', isRemote: true, isCurrent: false, hash: 'abc1234', ahead: 0, behind: 0 },
            ]),
            getAllTags: vi.fn(async () => [{ name: 'v1.0.0', hash: 'abc1234' }]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/data',
            data: expect.objectContaining({
                commits: [
                    expect.objectContaining({
                        hash: 'abc123456789',
                        refs: [
                            { name: 'experimental', kind: 'local', isCurrent: true },
                            { name: 'origin/experimental', kind: 'remote' },
                            { name: 'v1.0.0', kind: 'tag' },
                        ],
                    }),
                    expect.objectContaining({ hash: 'def123456789', refs: [] }),
                ],
            }),
        })));
    });

    it('posts an empty history payload when no repository is active', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(undefined));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/data',
            data: {
                commits: [],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        }));
    });

    it('responds to explicit page requests with hasMore', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => [
                commit('abc123456789', 'feat: page one'),
                commit('def123456789', 'feat: page two'),
                commit('fed123456789', 'feat: page three'),
            ]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/dataRequest',
            requestId: 'history-test-1',
            page: { offset: 2, limit: 2 },
        });

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/dataResponse',
            requestId: 'history-test-1',
            data: {
                commits: [{
                    hash: 'abc123456789',
                    shortHash: 'abc1234',
                    message: 'feat: page one',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'feat: page two',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                }],
                page: { offset: 2, limit: 2 },
                hasMore: true,
            },
        }));
        expect(repo.getLog).toHaveBeenCalledWith(3, 2);
    });

    it('responds to commit details requests with the full message and changed files', async () => {
        const repo = makeRepositoryMock({
            getCommitMessage: vi.fn(async () => 'feat: history\n\nbody'),
            getCommitFiles: vi.fn(async () => [{
                status: 'M',
                filePath: 'src/history.ts',
                parentHash: 'parent123',
            }, {
                status: 'A',
                filePath: 'modules/auth-kit',
                isSubmodule: true,
            }] satisfies readonly GitFileChange[]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/commitDetailsRequest',
            requestId: 'history-details-1',
            hash: 'abc123456789',
        });

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/commitDetailsResponse',
            requestId: 'history-details-1',
            details: {
                hash: 'abc123456789',
                fullMessage: 'feat: history\n\nbody',
                files: [{
                    status: 'M',
                    filePath: 'src/history.ts',
                    origPath: undefined,
                    parentHash: 'parent123',
                    isSubmodule: undefined,
                }, {
                    status: 'A',
                    filePath: 'modules/auth-kit',
                    origPath: undefined,
                    parentHash: undefined,
                    isSubmodule: true,
                }],
            },
        }));
        expect(repo.getCommitMessage).toHaveBeenCalledWith('abc123456789');
        expect(repo.getCommitFiles).toHaveBeenCalledWith('abc123456789');
    });

    it('selects a branch from the toolbar and refreshes history for that ref', async () => {
        setQuickPickValue('feature/history');
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
            getLogForRef: vi.fn(async () => [commit('feature123456789', 'feat: branch history')]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });

        await vi.waitFor(() => expect(repo.getLogForRef).toHaveBeenCalledWith('feature/history', 51, 0));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/data',
            data: expect.objectContaining({
                commits: [expect.objectContaining({ message: 'feat: branch history' })],
            }),
        }));
    });

    it('keeps the current history untouched when branch selection is cancelled', async () => {
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getLog).toHaveBeenCalledWith(51, 0));
        vi.mocked(repo.getLog).mockClear();
        vi.mocked(repo.getLogForRef).mockClear();
        vi.mocked(repo.getAllBranches).mockClear();

        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });

        await vi.waitFor(() => expect(repo.getAllBranches).toHaveBeenCalledOnce());
        expect(repo.getLog).not.toHaveBeenCalled();
        expect(repo.getLogForRef).not.toHaveBeenCalled();
    });

    it('returns from a selected branch to the current branch history', async () => {
        setQuickPickValue('feature/history');
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
            getLogForRef: vi.fn(async () => [commit('feature123456789', 'feat: branch history')]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });
        await vi.waitFor(() => expect(repo.getLogForRef).toHaveBeenCalledWith('feature/history', 51, 0));

        setQuickPickValue('Current Branch');
        vi.mocked(repo.getLog).mockClear();
        vi.mocked(repo.getLogForRef).mockClear();
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });

        await vi.waitFor(() => expect(repo.getLog).toHaveBeenCalledWith(51, 0));
        expect(repo.getLogForRef).not.toHaveBeenCalled();
    });

    it('loads subsequent pages from the selected branch history', async () => {
        setQuickPickValue('feature/history');
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
            getLogForRef: vi.fn(async () => [
                commit('feature123456789', 'feat: branch page'),
                commit('featurebase1234', 'feat: branch base'),
            ]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });
        await vi.waitFor(() => expect(repo.getLogForRef).toHaveBeenCalledWith('feature/history', 51, 0));
        vi.mocked(repo.getLogForRef).mockClear();

        view.messageHandler?.({
            type: 'history/dataRequest',
            requestId: 'history-branch-page-2',
            page: { offset: 50, limit: 25 },
        });

        await vi.waitFor(() => expect(repo.getLogForRef).toHaveBeenCalledWith('feature/history', 26, 50));
        await vi.waitFor(() => expect(view.messages.some((message) => isHistoryDataResponse(message, 'history-branch-page-2'))).toBe(true));
    });

    it('reuses branch and tag refs across history pagination', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => [commit('abc123456789', 'feat: history page')]),
            getAllBranches: vi.fn(async () => [{
                name: 'main',
                isRemote: false,
                isCurrent: true,
                hash: 'abc123456789',
                ahead: 0,
                behind: 0,
            }]),
            getAllTags: vi.fn(async () => [{ name: 'v1.0.0', hash: 'abc123456789' }]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'history/data' })));
        expect(repo.getAllBranches).toHaveBeenCalledOnce();
        vi.mocked(repo.getAllBranches).mockClear();
        vi.mocked(repo.getAllTags).mockClear();

        view.messageHandler?.({
            type: 'history/dataRequest',
            requestId: 'history-page-with-cached-refs',
            page: { offset: 50, limit: 25 },
        });

        await vi.waitFor(() => expect(view.messages.some((message) => isHistoryDataResponse(message, 'history-page-with-cached-refs'))).toBe(true));
        expect(repo.getAllBranches).not.toHaveBeenCalled();
        expect(repo.getAllTags).not.toHaveBeenCalled();
    });

    it('clears the selected history branch when the repository changes', async () => {
        setQuickPickValue('feature/history');
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
            getLogForRef: vi.fn(async () => [commit('feature123456789', 'feat: branch history')]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });
        await vi.waitFor(() => expect(repo.getLogForRef).toHaveBeenCalledWith('feature/history', 51, 0));
        vi.mocked(repo.getLog).mockClear();
        vi.mocked(repo.getLogForRef).mockClear();

        await provider.notifyRepoChanged({ id: 'next', cwd: '/next', kind: RepoKind.Main, label: 'next' });

        expect(repo.getLogForRef).not.toHaveBeenCalled();
        expect(repo.getLog).toHaveBeenCalledWith(51, 0);
    });

    it('goes to the current history item from the toolbar', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async () => 'head123456789'),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'goToCurrent' });

        await vi.waitFor(() => expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: 'head123456789' }));
        expect(repo.exec).toHaveBeenCalledWith(['rev-parse', 'HEAD']);
    });

    it('delegates fetch pull and push toolbar commands to VS Code Git then refreshes history', async () => {
        const repo = makeRepositoryMock();
        const onRepositoryUpdated = vi.fn(async () => {});
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'fetchAll' });
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'pull' });
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'push' });

        await vi.waitFor(() => expect(getCommandCalls().filter((call) => call.command.startsWith('git.')).map((call) => call.command)).toEqual([
            'git.fetchAll',
            'git.pull',
            'git.push',
        ]));
        expect(repo.fetchAll).not.toHaveBeenCalled();
        expect(repo.pull).not.toHaveBeenCalled();
        expect(repo.push).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(onRepositoryUpdated).toHaveBeenCalledTimes(3));
        expect(repo.getLog).toHaveBeenCalled();
    });

    it('posts a recoverable toolbar error when a git operation fails', async () => {
        const repo = makeRepositoryMock();
        commands.failCommand('git.fetchAll', new Error('fetch all failed'));
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'fetchAll' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/error',
            message: 'fetch all failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'history/fetchAll',
                recoverable: true,
            }),
        })));
    });

    it('opens commit history file diffs with parent and commit git URIs', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock({
            cwd: '/workspace',
        })));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/openDiff',
            commitHash: 'abc123456789',
            filePath: 'src/new-name.ts',
            status: 'R',
            origPath: 'src/old-name.ts',
            parentHash: 'parent123456789',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expect(call?.args[0]).toMatchObject({
            scheme: 'git',
            path: '/workspace/src/old-name.ts',
            query: JSON.stringify({ path: '/workspace/src/old-name.ts', ref: 'parent123456789' }),
        });
        expect(call?.args[1]).toMatchObject({
            scheme: 'git',
            path: '/workspace/src/new-name.ts',
            query: JSON.stringify({ path: '/workspace/src/new-name.ts', ref: 'abc123456789' }),
        });
        expect(call?.args[2]).toBe('new-name.ts (abc1234)');
    });

    it('runs native commit context commands against the latest webview target', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: 'abc123456789',
                hashes: ['abc123456789'],
                canUndoCommit: true,
            },
        });

        await vscode.commands.executeCommand('lookGit.history.copyRevisionNumber');

        expect(env.clipboard.value).toBe('abc123456789');
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('navigates to child and parent commits through native context commands', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: 'middle123456789',
                hashes: ['middle123456789'],
                childHash: 'child123456789',
                parentHash: 'parent123456789',
                canUndoCommit: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.history.goToChildCommit');
        await vscode.commands.executeCommand('lookGit.history.goToParentCommit');

        expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: 'child123456789' });
        expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: 'parent123456789' });
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('runs native file context commands against the latest webview target', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock({
            cwd: '/workspace',
        })));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/contextTarget',
            target: {
                kind: 'file',
                commitHash: 'abc123456789',
                file: { status: 'M', filePath: 'src/history.ts', parentHash: 'parent123456789' },
            },
        });

        await vscode.commands.executeCommand('lookGit.history.openFileDiff');

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        expect(getCommandCalls().find((entry) => entry.command === 'vscode.diff')?.args[2]).toBe('history.ts (abc1234)');
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('runs native view title commands without webview toolbar buttons', async () => {
        const repo = makeRepositoryMock();
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getLog).toHaveBeenCalledWith(51, 0));
        vi.mocked(repo.getLog).mockClear();

        await vscode.commands.executeCommand('lookGit.history.viewAsList');
        await vscode.commands.executeCommand('lookGit.history.viewAsTree');
        await vscode.commands.executeCommand('lookGit.history.refresh');

        expect(view.messages).toContainEqual({ type: 'history/applyFileViewMode', mode: 'list' });
        expect(view.messages).toContainEqual({ type: 'history/applyFileViewMode', mode: 'tree' });
        await vi.waitFor(() => expect(repo.getLog).toHaveBeenCalledWith(51, 0));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('posts a protocol error when history refresh fails', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => { throw new Error('history failed'); }),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/error',
            message: 'history failed',
            error: expect.objectContaining({
                code: 'refreshFailed',
                operation: 'history/refresh',
                recoverable: true,
            }),
        })));
    });
});

function commit(hash: string, message: string) {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName: 'Ada',
        authorEmail: 'ada@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
    };
}

function isHistoryDataResponse(value: unknown, requestId: string): boolean {
    return isRecord(value)
        && value.type === 'history/dataResponse'
        && value.requestId === requestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
