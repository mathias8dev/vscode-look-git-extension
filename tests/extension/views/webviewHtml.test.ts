import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../../../src/extension/views/webviewHtml';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { workspace } from '../../mocks/vscode';

describe('getWebviewHtml', () => {
    beforeEach(() => {
        resetVscodeMock();
    });

    it.each(['changes', 'graph', 'history'] as const)('disables default context menu items for %s webview', (scriptName) => {
        const view = makeWebviewView();
        const html = getWebviewHtml(view.webview, vscode.Uri.file('/ext'), scriptName);
        const context = bodyContext(html);

        expect(context).toEqual({ preventDefaultContextMenuItems: true });
    });

    it('injects the configured Look Git font size before loading the webview bundle', () => {
        workspace.values.set('lookGit.fontSize', 18);
        const view = makeWebviewView();

        const html = getWebviewHtml(view.webview, vscode.Uri.file('/ext'), 'changes');

        expect(html).toContain('<style');
        expect(html).toContain('--look-git-font-size: 18px');
        expect(html.indexOf('--look-git-font-size: 18px')).toBeLessThan(html.indexOf('<link rel="stylesheet"'));
    });

    it('follows VS Code editor font size when Look Git font size is auto', () => {
        workspace.values.set('editor.fontSize', 17);
        workspace.values.set('lookGit.fontSize', 0);
        const view = makeWebviewView();

        const html = getWebviewHtml(view.webview, vscode.Uri.file('/ext'), 'graph');

        expect(html).toContain('--look-git-font-size: 17px');
    });
});

function bodyContext(html: string): unknown {
    const match = html.match(/<body data-vscode-context='([^']+)'>/);
    expect(match).not.toBeNull();
    return JSON.parse(match?.[1] ?? '{}') as unknown;
}
