// Mock helpers for testing WebviewViewProviders
import * as vscode from 'vscode';

export function resetVscodeMock(): void {
    (vscode.commands as any).reset();
    (vscode.window as any).reset();
    (vscode.workspace as any).reset();
}

export interface MockWebviewView {
    webview: {
        options: unknown;
        html: string;
        postMessage(msg: unknown): void;
        onDidReceiveMessage(handler: (msg: unknown) => void): { dispose(): void };
        asWebviewUri(uri: unknown): unknown;
    };
    visible: boolean;
    badge: { value: number; tooltip: string } | undefined;
    messages: unknown[];
    messageHandler: ((msg: unknown) => void) | undefined;
    visibilityHandler: (() => void) | undefined;
    onDidChangeVisibility(handler: () => void): { dispose(): void };
}

export function makeWebviewView(): MockWebviewView {
    const view: MockWebviewView = {
        webview: {
            options: {},
            html: '',
            postMessage(msg: unknown) { view.messages.push(msg); },
            onDidReceiveMessage(handler: (msg: unknown) => void) {
                view.messageHandler = handler;
                return { dispose() {} };
            },
            asWebviewUri(uri: unknown) { return uri; },
        },
        visible: true,
        badge: undefined,
        messages: [],
        messageHandler: undefined,
        visibilityHandler: undefined,
        onDidChangeVisibility(handler: () => void) {
            view.visibilityHandler = handler;
            return { dispose() {} };
        },
    };
    return view;
}

export function statusEntry(filePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { indexStatus: 'M', workTreeStatus: ' ', filePath, ...overrides };
}
