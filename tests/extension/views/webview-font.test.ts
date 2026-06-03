import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    getConfiguredWebviewFontSize,
    normalizeWebviewFontSize,
    registerWebviewFontSizeSync,
    webviewFontSizeMessage,
    webviewFontSizeStyle,
} from '../../../src/extension/views/webview-font';
import { resetVscodeMock } from '../../helpers/providerRuntime';
import { workspace } from '../../mocks/vscode';

describe('webview font size', () => {
    beforeEach(() => {
        resetVscodeMock();
    });

    it('uses Look Git font size when configured', () => {
        workspace.values.set('editor.fontSize', 15);
        workspace.values.set('lookGit.fontSize', 18);

        expect(getConfiguredWebviewFontSize()).toBe(18);
        expect(webviewFontSizeMessage()).toEqual({ type: 'ui/fontSizeChanged', fontSize: 18 });
        expect(webviewFontSizeStyle()).toBe(':root { --look-git-font-size: 18px; }');
    });

    it('accepts numeric font size values from settings JSON', () => {
        workspace.values.set('editor.fontSize', 15);
        workspace.values.set('lookGit.fontSize', '20');

        expect(getConfiguredWebviewFontSize()).toBe(20);
    });

    it('falls back to VS Code editor font size when Look Git font size is auto', () => {
        workspace.values.set('editor.fontSize', 16);
        workspace.values.set('lookGit.fontSize', 0);

        expect(getConfiguredWebviewFontSize()).toBe(16);
    });

    it('uses the default font size when settings are invalid or missing', () => {
        workspace.values.set('editor.fontSize', 'large');
        workspace.values.set('lookGit.fontSize', -1);

        expect(getConfiguredWebviewFontSize()).toBe(13);
        expect(normalizeWebviewFontSize(undefined)).toBe(13);
        expect(normalizeWebviewFontSize(20)).toBe(20);
    });

    it('notifies targets when Look Git or editor font size changes', () => {
        const target = { notifyFontSizeChanged: vi.fn() };
        const disposable = registerWebviewFontSizeSync([target]);

        workspace.fireConfigurationChanged('files.autoSave');
        expect(target.notifyFontSizeChanged).not.toHaveBeenCalled();

        workspace.fireConfigurationChanged('lookGit');
        workspace.fireConfigurationChanged('editor.fontSize');
        workspace.fireConfigurationChanged('lookGit.fontSize');

        expect(target.notifyFontSizeChanged).toHaveBeenCalledTimes(3);
        disposable.dispose();

        workspace.fireConfigurationChanged('lookGit.fontSize');
        expect(target.notifyFontSizeChanged).toHaveBeenCalledTimes(3);
    });

    it('emits updated font size when configuration update fires', async () => {
        const target = { notifyFontSizeChanged: vi.fn() };
        registerWebviewFontSizeSync([target]);

        await vscode.workspace.getConfiguration('lookGit').update('fontSize', 19);

        expect(target.notifyFontSizeChanged).toHaveBeenCalledOnce();
        expect(webviewFontSizeMessage()).toEqual({ type: 'ui/fontSizeChanged', fontSize: 19 });
    });
});
