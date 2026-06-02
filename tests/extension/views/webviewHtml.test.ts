import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../../../src/extension/views/webviewHtml';
import { makeWebviewView } from '../../helpers/providerRuntime';

describe('getWebviewHtml', () => {
    it.each(['changes', 'graph', 'history'] as const)('disables default context menu items for %s webview', (scriptName) => {
        const view = makeWebviewView();
        const html = getWebviewHtml(view.webview, vscode.Uri.file('/ext'), scriptName);
        const context = bodyContext(html);

        expect(context).toEqual({ preventDefaultContextMenuItems: true });
    });
});

function bodyContext(html: string): unknown {
    const match = html.match(/<body data-vscode-context='([^']+)'>/);
    expect(match).not.toBeNull();
    return JSON.parse(match?.[1] ?? '{}') as unknown;
}
