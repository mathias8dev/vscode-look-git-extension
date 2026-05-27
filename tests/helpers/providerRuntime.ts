import { vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitStatusEntry } from '../../src/gitService';

export function resetVscodeMock(): void {
    (vscode.commands as any).reset();
    (vscode.window as any).reset();
    (vscode.workspace as any).reset?.();
}

export function makeWebviewView() {
    const messages: unknown[] = [];
    let messageHandler: ((msg: unknown) => unknown) | undefined;
    let visibilityHandler: (() => unknown) | undefined;
    return {
        messages,
        get messageHandler() {
            return messageHandler;
        },
        get visibilityHandler() {
            return visibilityHandler;
        },
        webview: {
            options: {},
            html: '',
            cspSource: 'vscode-webview://test',
            asWebviewUri: (uri: unknown) => uri,
            postMessage: vi.fn((msg: unknown) => {
                messages.push(msg);
                return Promise.resolve(true);
            }),
            onDidReceiveMessage: vi.fn((handler: (msg: unknown) => unknown) => {
                messageHandler = handler;
                return { dispose: vi.fn() };
            }),
        },
        visible: true,
        badge: undefined,
        show: vi.fn(),
        onDidChangeVisibility: vi.fn((handler: () => unknown) => {
            visibilityHandler = handler;
            return { dispose: vi.fn() };
        }),
    };
}

export function statusEntry(filePath: string): GitStatusEntry {
    return { indexStatus: 'M', workTreeStatus: 'M', filePath };
}
