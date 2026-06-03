import * as vscode from 'vscode';
import type { WebviewFontSizeChangedPush } from '../../protocol/shared/ui';

const DEFAULT_WEBVIEW_FONT_SIZE = 13;

export interface WebviewFontSizeTarget {
    notifyFontSizeChanged(): void;
}

export function getConfiguredWebviewFontSize(): number {
    const lookGitFontSize = positiveFontSize(vscode.workspace.getConfiguration('lookGit').get('fontSize'));
    return lookGitFontSize ?? normalizeWebviewFontSize(vscode.workspace.getConfiguration('editor').get('fontSize'));
}

export function normalizeWebviewFontSize(value: unknown): number {
    return positiveFontSize(value) ?? DEFAULT_WEBVIEW_FONT_SIZE;
}

export function webviewFontSizeStyle(fontSize = getConfiguredWebviewFontSize()): string {
    return `:root { --look-git-font-size: ${normalizeWebviewFontSize(fontSize)}px; }`;
}

export function webviewFontSizeMessage(): WebviewFontSizeChangedPush {
    return {
        type: 'ui/fontSizeChanged',
        fontSize: getConfiguredWebviewFontSize(),
    };
}

export function registerWebviewFontSizeSync(targets: readonly WebviewFontSizeTarget[]): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('lookGit.fontSize') && !event.affectsConfiguration('editor.fontSize')) { return; }
        for (const target of targets) {
            target.notifyFontSizeChanged();
        }
    });
}

function positiveFontSize(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}
