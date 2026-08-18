import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GraphViewProvider } from '@extension/views/graph-view-provider';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';
import { commands } from '@tests/mocks/vscode';
import { commitContextActionIds } from '@tests/helpers/commit-context-commands';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';

describe('GraphViewProvider', () => {
    it('registers every graph commit context action', () => {
        resetVscodeMock();
        const provider = new GraphViewProvider(vscode.Uri.file('/extension'), { currentContext: undefined, contexts: [] });

        provider.registerNativeContextCommands();

        for (const command of commitContextActionIds('lookGit.graph.commit')) {
            expect(commands.registrations.has(command), command).toBe(true);
        }
    });

    it('navigates from the context commit while multiple commits are selected', async () => {
        resetVscodeMock();
        const provider = new GraphViewProvider(vscode.Uri.file('/extension'), { currentContext: undefined, contexts: [] });
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();
        view.messageHandler?.({
            type: 'graph/contextTarget',
            target: {
                kind: 'commit',
                hash: 'clicked',
                hashes: ['newest', 'clicked', 'oldest'],
                childHash: 'child',
                parentHash: 'parent',
                canUndoCommit: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.graph.commit.goToChildCommit');
        await vscode.commands.executeCommand('lookGit.graph.commit.goToParentCommit');

        expect(view.messages).toEqual(expect.arrayContaining([
            { type: 'graph/selectCommit', hash: 'child' },
            { type: 'graph/selectCommit', hash: 'parent' },
        ]));
    });

    it('forwards the complete commit selection to graph context commands', async () => {
        resetVscodeMock();
        const handle = vi.spyOn(GraphMessageRouter.prototype, 'handle').mockResolvedValue();
        const provider = new GraphViewProvider(vscode.Uri.file('/extension'), { currentContext: undefined, contexts: [] });
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        provider.registerNativeContextCommands();
        view.messageHandler?.({
            type: 'graph/contextTarget',
            target: {
                kind: 'commit',
                hash: 'clicked',
                hashes: ['newest', 'clicked', 'oldest'],
                canUndoCommit: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.graph.commit.createPatch');

        expect(handle).toHaveBeenCalledWith({
            type: 'graph/commitCommand',
            command: 'createPatch',
            hash: 'clicked',
            hashes: ['newest', 'clicked', 'oldest'],
        });
        handle.mockRestore();
    });

    it('routes repository navigation messages through the navigation callback', async () => {
        resetVscodeMock();
        const onRepositoryNavigation = vi.fn(async () => {});
        const provider = new GraphViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: undefined, contexts: [] },
            async () => {},
            undefined,
            undefined,
            onRepositoryNavigation,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'repo/navigateRepository', contextId: 'repo-3' });

        await expect.poll(() => onRepositoryNavigation.mock.calls.length).toBe(1);
        expect(onRepositoryNavigation).toHaveBeenCalledWith({ type: 'repo/navigateRepository', contextId: 'repo-3' });
    });

    it('announces navigation without requesting graph data before runtime readiness', () => {
        resetVscodeMock();
        const context = { id: 'repo-3', cwd: '/repo-3', kind: RepoKind.Main, label: 'repo-3' } satisfies RepoContext;
        const provider = new GraphViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context, contexts: [context] },
            async () => {},
        );
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messages.length = 0;

        provider.notifyRepoNavigationStarted(context);

        expect(view.messages).toEqual([{
            type: 'repo/navigationStarted',
            context: { id: 'repo-3', cwd: '/repo-3', kind: 'main', label: 'repo-3' },
        }]);
    });

    it('replays pending navigation and ignores graph requests until runtime readiness', async () => {
        resetVscodeMock();
        const context = { id: 'repo-3', cwd: '/repo-3', kind: RepoKind.Main, label: 'repo-3' } satisfies RepoContext;
        const beforeRequest = vi.fn(async () => false);
        const provider = new GraphViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: context, contexts: [context] },
            async () => {},
            undefined,
            undefined,
            async () => {},
            beforeRequest,
        );
        provider.notifyRepoNavigationStarted(context);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'graph/ready' });
        view.messageHandler?.({ type: 'graph/refresh' });
        await expect.poll(() => beforeRequest.mock.calls.length).toBe(1);

        expect(view.messages).toContainEqual(expect.objectContaining({ type: 'repo/navigationStarted' }));
        expect(view.messages.some((message) => isMessageType(message, 'graph/refreshRequested'))).toBe(false);
    });

    it('refreshes graph data when repository state changes while VS Code reports the view as hidden', async () => {
        resetVscodeMock();
        const provider = new GraphViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: undefined, contexts: [] },
            async () => {},
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messages.length = 0;
        view.visible = false;

        await provider.refresh();

        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataPush',
            repoId: '',
        }));
    });
});

function isMessageType(message: unknown, type: string): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === type;
}
