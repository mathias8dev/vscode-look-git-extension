import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GraphViewProvider } from '../../../src/extension/views/GraphViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { env } from '../../mocks/vscode';

interface GraphDataPushLike {
    readonly type: 'graph/dataPush';
    readonly data: Record<string, unknown>;
}

function isGraphDataPushLike(message: unknown): message is GraphDataPushLike {
    return typeof message === 'object'
        && message !== null
        && 'type' in message
        && message.type === 'graph/dataPush'
        && 'data' in message
        && typeof message.data === 'object'
        && message.data !== null;
}

describe('GraphViewProvider', () => {
    beforeEach(resetVscodeMock);

    it('posts semantic graph data without backend rendering fields', async () => {
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [{
                hash: 'abc123456789',
                shortHash: 'abc1234',
                message: 'feat: graph',
                authorName: 'Ada',
                authorEmail: 'ada@example.com',
                authorDate: '2024-01-01T00:00:00Z',
                parentHashes: ['parent'],
                refs: ['HEAD -> main'],
            }]),
            getAllBranches: vi.fn(async () => [{
                name: 'main',
                isRemote: false,
                isCurrent: true,
                hash: 'abc1234',
                ahead: 0,
                behind: 0,
            }]),
        });
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => {
            const message = view.messages.find(isGraphDataPushLike);
            expect(message).toBeDefined();
            expect(message?.data.commits).toEqual([expect.objectContaining({
                hash: 'abc123456789',
                refs: ['HEAD -> main'],
            })]);
            expect(message?.data).not.toHaveProperty('rows');
            expect(message?.data).not.toHaveProperty('maxLane');
        });
    });

    it('posts a protocol error when the initial graph refresh fails', async () => {
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => { throw new Error('graph refresh failed'); }),
        });
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            message: 'graph refresh failed',
            error: expect.objectContaining({
                code: 'refreshFailed',
                operation: 'graph/refresh',
                recoverable: true,
            }),
        })));
    });

    it('keeps the requestId when a graph request fails', async () => {
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => { throw new Error('graph request failed'); }),
        });
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'graph/dataRequest',
            requestId: 'request-1',
            repoId: repo.cwd,
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            requestId: 'request-1',
            message: 'graph request failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'graph/dataRequest',
            }),
        })));
    });

    it('reports optional graph side-panel failures without dropping graph data', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => { throw new Error('worktree list failed'); }),
        });
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            message: 'worktree list failed',
            error: expect.objectContaining({
                code: 'optionalDataUnavailable',
                operation: 'graph/listWorktrees',
            }),
        })));
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataPush',
        })));
    });

    it('runs native graph context commands against the latest webview target', async () => {
        const repo = makeRepositoryMock();
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'graph/contextTarget',
            target: {
                kind: 'commit',
                hash: 'abc123456789',
                hashes: ['abc123456789'],
                childHash: 'child123456789',
                parentHash: 'parent123456789',
                canUndoCommit: true,
            },
        });

        await vscode.commands.executeCommand('lookGit.graph.commit.copyRevisionNumber');
        await vscode.commands.executeCommand('lookGit.graph.commit.goToChildCommit');
        await vscode.commands.executeCommand('lookGit.graph.commit.goToParentCommit');

        expect(env.clipboard.value).toBe('abc123456789');
        expect(view.messages).toContainEqual({ type: 'graph/selectCommit', hash: 'child123456789' });
        expect(view.messages).toContainEqual({ type: 'graph/selectCommit', hash: 'parent123456789' });

        view.messageHandler?.({
            type: 'graph/contextTarget',
            target: { kind: 'branch', branch: 'feature/native', isRemote: false },
        });
        await vscode.commands.executeCommand('lookGit.graph.branch.checkout');
        expect(repo.checkout).toHaveBeenCalledWith('feature/native');

        view.messageHandler?.({
            type: 'graph/contextTarget',
            target: { kind: 'worktree', path: '/repo/.worktrees/native' },
        });
        await vscode.commands.executeCommand('lookGit.graph.worktree.showDetails');
        expect(view.messages).toContainEqual({ type: 'graph/selectWorktree', path: '/repo/.worktrees/native' });

        disposables.forEach((disposable) => disposable.dispose());
    });
});
