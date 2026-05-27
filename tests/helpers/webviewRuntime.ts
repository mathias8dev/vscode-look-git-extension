import { vi } from 'vitest';

export const CHANGES_WEBVIEW_MODULE = '../../dist/webview/changes.js';
export const GRAPH_WEBVIEW_MODULE = '../../dist/webview/graph.js';

export interface MockVsCodeApi {
    messages: unknown[];
    state: unknown;
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

function installVsCodeApi(initialState: unknown = null): MockVsCodeApi {
    const api: MockVsCodeApi = {
        messages: [],
        state: initialState,
        postMessage(msg: unknown) {
            this.messages.push(msg);
        },
        getState() {
            return this.state;
        },
        setState(state: unknown) {
            this.state = state;
        },
    };
    (globalThis as any).acquireVsCodeApi = () => api;
    return api;
}

export async function bootWebview(modulePath: string, initialState: unknown = null): Promise<MockVsCodeApi> {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';
    const api = installVsCodeApi(initialState);
    await import(modulePath);
    return api;
}

export function sendWebviewMessage(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', { data }));
}

export function click(selector: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    element.click();
}

export function input(selector: string, value: string): void {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (!element) {
        throw new Error(`Missing input: ${selector}`);
    }
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
}
