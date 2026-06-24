import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GraphViewProvider } from '@extension/views/graph-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';

describe('GraphViewProvider', () => {
    it('routes repository navigation messages through the navigation callback', async () => {
        resetVscodeMock();
        const onRepositoryNavigation = vi.fn(async () => {});
        const provider = new GraphViewProvider(
            vscode.Uri.file('/extension'),
            { currentContext: undefined },
            async () => {},
            undefined,
            undefined,
            onRepositoryNavigation,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'repo/openRepositoryInNewWindow', contextId: 'repo-3' });

        await expect.poll(() => onRepositoryNavigation.mock.calls.length).toBe(1);
        expect(onRepositoryNavigation).toHaveBeenCalledWith({ type: 'repo/openRepositoryInNewWindow', contextId: 'repo-3' });
    });
});
