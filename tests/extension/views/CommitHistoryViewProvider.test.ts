import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import type { GitFileChange } from '../../../src/application/ports/git-repository';
import type { RemoteCommandBackend } from '../../../src/application/ports/remote-command-backend';
import { OperationStatus } from '../../../src/protocol/shared/operation';
import { ConflictState } from '../../../src/protocol/changes/types';
import { RepoKind } from '../../../src/core/git/domain/RepoContext';
import { LOG_FIELD_SEP, LOG_RECORD_SEP } from '../../../src/core/parsing/parseLog';
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { registerReadonlyDiffDocumentProvider } from '../../../src/extension/utils/readonly-diff-documents';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, getCommandCalls, setQuickPickValue, workspace } from '../../mocks/vscode';

describe('CommitHistoryViewProvider error propagation', () => {
    beforeEach(() => {
        resetVscodeMock();
        registerReadonlyDiffDocumentProvider();
    });

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
                    canCherryPick: false,
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'fix: second',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                    canCherryPick: false,
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

    it('posts an empty history payload when the active repository has no commits yet', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => []),
            getAllBranches: vi.fn(async () => []),
            getAllTags: vi.fn(async () => []),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
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
        expect(view.messages.some((message) => isRecord(message) && message.type === 'history/error')).toBe(false);
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
                    canCherryPick: false,
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'feat: page two',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                    refs: [],
                    canCherryPick: false,
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

    it('marks selected branch commits as cherry-pickable when they are outside current history', async () => {
        setQuickPickValue('feature/history');
        const repo = makeRepositoryMock({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/history',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123456789',
                ahead: 0,
                behind: 0,
            }]),
            getLogForRef: vi.fn(async () => [commit('feature123456789', 'feat: branch history')]),
            execRaw: vi.fn(async () => 'feature123456789\n'),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectBranch' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/data',
            data: expect.objectContaining({
                commits: [expect.objectContaining({
                    hash: 'feature123456789',
                    canCherryPick: true,
                })],
            }),
        })));
        expect(repo.execRaw).toHaveBeenCalledWith(['rev-list', '--no-walk', 'feature123456789', '--not', 'HEAD'], undefined);
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
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/operationStatus',
            status: OperationStatus.Running,
            command: 'fetchAll',
        }));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/operationStatus',
            status: OperationStatus.Success,
            command: 'push',
        }));
    });

    it('opens the VS Code output panel from history operation notices', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/showOutput' });

        expect(getCommandCalls()).toContainEqual({ command: 'workbench.action.output.toggleOutput', args: [] });
    });

    it('publishes from the history toolbar when the current branch has no upstream', async () => {
        const repo = makeRepositoryMock({
            getCurrentBranch: vi.fn(async () => 'topic'),
            getAllBranches: vi.fn(async () => [
                { name: 'topic', isRemote: false, isCurrent: true, hash: 'topic-head', upstream: undefined, ahead: 0, behind: 0 },
            ]),
        });
        const onRepositoryUpdated = vi.fn(async () => {});
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'push' });

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({ command: 'git.publish', args: [] }));
        expect(getCommandCalls()).not.toContainEqual({ command: 'git.push', args: [] });
        await vi.waitFor(() => expect(onRepositoryUpdated).toHaveBeenCalledOnce());
    });

    it('shows the history repository selector only when submodules are available', async () => {
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/auth-kit', status: ' ' as const }]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({
            command: 'setContext',
            args: ['lookGit.historyHasSubmodules', true],
        }));
    });

    it('selects a submodule as the commit history repository scope', async () => {
        setQuickPickValue('Submodule: modules/auth-kit');
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/auth-kit', status: ' ' as const }]),
            execRaw: vi.fn(async (args) => scopedHistoryOutput(args)),
            exec: vi.fn(async (args) => {
                if (args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD') { return 'feature/auth'; }
                if (args.join(' ') === '-C modules/auth-kit rev-parse HEAD') { return 'submodule-head'; }
                return '';
            }),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectRepositoryScope' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/data',
            data: expect.objectContaining({
                commits: [expect.objectContaining({
                    hash: 'submodule123456789',
                    message: 'feat(auth): scoped history',
                })],
            }),
        })));
        expect(repo.execRaw).toHaveBeenCalledWith(expect.arrayContaining(['-C', 'modules/auth-kit', 'log']), undefined);

        view.messages = [];
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'goToCurrent' });

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', 'modules/auth-kit', 'rev-parse', 'HEAD'], undefined));
        await vi.waitFor(() => expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: 'submodule-head' }));
    });

    it('runs history remote toolbar commands against the selected submodule scope', async () => {
        setQuickPickValue('Submodule: modules/auth-kit');
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/auth-kit', status: ' ' as const }]),
            execRaw: vi.fn(async (args) => scopedHistoryOutput(args)),
            exec: vi.fn(async (args) => args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD' ? 'feature/auth' : ''),
        });
        const remoteCommands: RemoteCommandBackend = {
            runVscode: vi.fn(async () => {}),
            runCli: vi.fn(async () => {}),
        };
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo), async () => {}, remoteCommands);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'selectRepositoryScope' });
        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith(expect.arrayContaining(['-C', 'modules/auth-kit', 'log']), undefined));

        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'fetchAll' });

        await vi.waitFor(() => expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve(repo.cwd, 'modules/auth-kit') }),
            'fetchAll',
        ));
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
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/operationStatus',
            status: OperationStatus.Failed,
            command: 'fetchAll',
        }));
    });

    it('reports a history pull as conflict when the repository enters a conflicted state', async () => {
        const repo = makeRepositoryMock({
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: ConflictState.Merge,
            })),
        });
        commands.failCommand('git.pull', new Error('Automatic merge failed; fix conflicts and then commit the result.'));
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'history/toolbarCommand', command: 'pull' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/operationStatus',
            status: OperationStatus.Conflict,
            command: 'pull',
        })));
        expect(view.messages).not.toContainEqual(expect.objectContaining({ type: 'history/error' }));
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
            query: JSON.stringify({ path: path.join('/workspace', 'src/old-name.ts'), ref: 'parent123456789' }),
        });
        expect(call?.args[1]).toMatchObject({
            scheme: 'git',
            path: '/workspace/src/new-name.ts',
            query: JSON.stringify({ path: path.join('/workspace', 'src/new-name.ts'), ref: 'abc123456789' }),
        });
        expect(call?.args[2]).toBe('new-name.ts (abc1234)');
    });

    it('opens commit history submodule gitlink diffs as readonly diff output', async () => {
        const repo = makeRepositoryMock({
            cwd: '/workspace',
            execRaw: vi.fn(async () => [
                'diff --git a/modules/auth-kit b/modules/auth-kit',
                'index 8c253b5..52b893d 160000',
                '--- a/modules/auth-kit',
                '+++ b/modules/auth-kit',
                '@@ -1 +1 @@',
                '-Subproject commit 8c253b55f68bb7e39189a4c12a4043138b8f38fb',
                '+Subproject commit 52b893d47db993db84236fed897f463a964632f8',
                '',
            ].join('\n')),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'history/openDiff',
            commitHash: 'abc123456789',
            filePath: 'modules/auth-kit',
            status: 'M',
            parentHash: 'parent123456789',
            isSubmodule: true,
        });

        await vi.waitFor(() => expect(workspace.documents.at(-1)?.uri?.scheme).toBe('lookgit-diff'));
        expect(repo.execRaw).toHaveBeenCalledWith(['diff', '--submodule=short', 'parent123456789', 'abc123456789', '--', 'modules/auth-kit']);
        expect(commands.calls.some((call) => call.command === 'vscode.diff')).toBe(false);
        expect(workspace.documents.at(-1)?.content).toContain('Subproject commit');
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

function scopedHistoryOutput(args: readonly string[]): string {
    const command = args.join(' ');
    if (command.startsWith('-C modules/auth-kit log ')) {
        return [
            'submodule123456789',
            'submodu',
            'feat(auth): scoped history',
            'Ada',
            'ada@example.com',
            '2024-01-01T00:00:00Z',
            '',
        ].join(LOG_FIELD_SEP) + LOG_RECORD_SEP;
    }
    if (command.startsWith('-C modules/auth-kit for-each-ref ')) {
        return '';
    }
    if (command === '-C modules/auth-kit tag --format=%(refname:short)%00%(objectname)') {
        return '';
    }
    return '';
}

function isHistoryDataResponse(value: unknown, requestId: string): boolean {
    return isRecord(value)
        && value.type === 'history/dataResponse'
        && value.requestId === requestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
