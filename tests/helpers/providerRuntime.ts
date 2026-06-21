// Mock helpers for testing WebviewViewProviders
import * as vscode from 'vscode';
import { resetMockVscode } from '@tests/mocks/vscode';

export function resetVscodeMock(): void {
    resetMockVscode();
}

interface MockWebview extends vscode.Webview {
    options: vscode.WebviewOptions;
    html: string;
    postMessage(msg: unknown): Thenable<boolean>;
    onDidReceiveMessage: vscode.Event<unknown>;
    asWebviewUri(uri: vscode.Uri): vscode.Uri;
}

export interface MockWebviewView extends vscode.WebviewView {
    webview: MockWebview;
    visible: boolean;
    badge: vscode.ViewBadge | undefined;
    messages: unknown[];
    messageHandler: ((msg: unknown) => void) | undefined;
    visibilityHandler: (() => void) | undefined;
    onDidDispose: vscode.Event<void>;
    onDidChangeVisibility: vscode.Event<void>;
}

export function makeWebviewView(): MockWebviewView {
    const view: MockWebviewView = {
        viewType: 'lookGit.testView',
        webview: {
            options: {},
            html: '',
            cspSource: 'vscode-webview:',
            postMessage(message: unknown): Thenable<boolean> {
                view.messages.push(message);
                return Promise.resolve(true);
            },
            onDidReceiveMessage(listener: (message: unknown) => unknown): vscode.Disposable {
                view.messageHandler = (message) => { listener(message); };
                return { dispose() {} };
            },
            asWebviewUri(uri: vscode.Uri): vscode.Uri { return uri; },
        },
        visible: true,
        badge: undefined,
        messages: [],
        messageHandler: undefined,
        visibilityHandler: undefined,
        onDidDispose(_listener: () => unknown): vscode.Disposable { return { dispose() {} }; },
        onDidChangeVisibility(listener: () => unknown): vscode.Disposable {
            view.visibilityHandler = () => { listener(); };
            return { dispose() {} };
        },
        show() {},
    };
    return view;
}

export function statusEntry(filePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { indexStatus: 'M', workTreeStatus: ' ', filePath, ...overrides };
}
