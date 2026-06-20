import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GraphViewProvider } from '../../../src/extension/views/GraphViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, workspace } from '../../mocks/vscode';

interface GraphDataPushLike {
    readonly type: 'graph/dataPush' | 'graph/dataResponse';
    readonly data: Record<string, unknown>;
}

function isGraphDataMessageLike(message: unknown): message is GraphDataPushLike {
    return typeof message === 'object'
        && message !== null
        && 'type' in message
        && (message.type === 'graph/dataPush' || message.type === 'graph/dataResponse')
        && 'data' in message
        && typeof message.data === 'object'
        && message.data !== null;
}

describe('GraphViewProvider', () => {
    beforeEach(resetVscodeMock);

    it('posts configured font size updates without reloading the graph webview', () => {
        workspace.values.set('lookGit.fontSize', 21);
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        const initialHtml = view.webview.html;
        workspace.values.set('lookGit.fontSize', 24);
        view.messages = [];
        provider.notifyFontSizeChanged();

        expect(view.messages).toContainEqual({ type: 'ui/fontSizeChanged', fontSize: 24 });
        expect(view.webview.html).toBe(initialHtml);
    });

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
        view.messageHandler?.({
            type: 'graph/dataRequest',
            requestId: 'graph-provider-data',
            repoId: repo.cwd,
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        await vi.waitFor(() => {
            const message = view.messages.find(isGraphDataMessageLike);
            expect(message).toBeDefined();
            expect(message?.data.commits).toEqual([expect.objectContaining({
                hash: 'abc123456789',
                refs: ['HEAD -> main'],
            })]);
            expect(message?.data).not.toHaveProperty('rows');
            expect(message?.data).not.toHaveProperty('maxLane');
        });
    });

    it('posts a protocol error when a graph data request fails', async () => {
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => { throw new Error('graph refresh failed'); }),
        });
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'graph/dataRequest',
            requestId: 'graph-refresh-failed',
            repoId: repo.cwd,
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            requestId: 'graph-refresh-failed',
            message: 'graph refresh failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'graph/dataRequest',
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
        view.messageHandler?.({
            type: 'graph/dataRequest',
            requestId: 'graph-optional-data',
            repoId: repo.cwd,
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            message: 'worktree list failed',
            error: expect.objectContaining({
                code: 'optionalDataUnavailable',
                operation: 'graph/listWorktrees',
            }),
        })));
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'graph-optional-data',
        })));
    });

    it('requests the webview to refresh instead of pushing default graph data', async () => {
        const repo = makeRepositoryMock();
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).toContainEqual({ type: 'graph/refreshRequested' });
        expect(repo.getGraphLog).not.toHaveBeenCalled();
    });

    it('does not refresh the graph while the webview is hidden', async () => {
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(makeRepositoryMock()));
        const view = makeWebviewView();
        view.visible = false;

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(view.messages).not.toContainEqual({ type: 'graph/refreshRequested' });
    });

    it('notifies dependent views after repository mutations from the graph webview', async () => {
        const repo = makeRepositoryMock();
        const onRepositoryUpdated = vi.fn(async () => {});
        const provider = new GraphViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'graph/repositoryCommand', command: 'fetch' });

        await vi.waitFor(() => expect(commands.calls).toContainEqual({ command: 'git.fetchAll', args: [] }));
        expect(repo.fetchAll).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(view.messages).toContainEqual({ type: 'graph/refreshRequested' }));
        await vi.waitFor(() => expect(onRepositoryUpdated).toHaveBeenCalledOnce());
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
