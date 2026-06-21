import * as vscode from 'vscode';
import type { WebviewFontSizeChangedPush } from '@protocol/shared/ui';

const DEFAULT_WEBVIEW_FONT_SIZE = 13;

export interface WebviewFontSizeTarget {
    notifyFontSizeChanged(): void;
}

export function getConfiguredWebviewFontSize(): number {
    const rootConfiguration = vscode.workspace.getConfiguration();
    const lookGitFontSize =
        positiveFontSize(rootConfiguration.get('lookGit.fontSize'))
        ?? positiveFontSize(vscode.workspace.getConfiguration('lookGit').get('fontSize'));
    const editorFontSize =
        positiveFontSize(rootConfiguration.get('editor.fontSize'))
        ?? positiveFontSize(vscode.workspace.getConfiguration('editor').get('fontSize'));
    return lookGitFontSize ?? normalizeWebviewFontSize(editorFontSize);
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
        if (!affectsWebviewFontSize(event)) { return; }
        for (const target of targets) {
            target.notifyFontSizeChanged();
        }
    });
}

function positiveFontSize(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    if (typeof value !== 'string' || value.trim() === '') { return undefined; }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

function affectsWebviewFontSize(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('lookGit')
        || event.affectsConfiguration('lookGit.fontSize')
        || event.affectsConfiguration('editor')
        || event.affectsConfiguration('editor.fontSize');
}
