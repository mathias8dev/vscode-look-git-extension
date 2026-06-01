import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitFileChange } from '../../../src/core/git/GitRepository';
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { env, getCommandCalls } from '../../mocks/vscode';

describe('CommitHistoryViewProvider error propagation', () => {
    beforeEach(resetVscodeMock);

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
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'fix: second',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
                }],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        }));
        expect(repo.getLog).toHaveBeenCalledWith(51, 0);
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
                }, {
                    hash: 'def123456789',
                    shortHash: 'def1234',
                    message: 'feat: page two',
                    authorName: 'Ada',
                    authorDate: '2024-01-01T00:00:00Z',
                    parentHashes: [],
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
