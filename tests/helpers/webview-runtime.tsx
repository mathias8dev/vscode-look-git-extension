// @vitest-environment jsdom
// React + Zustand webview test helpers
import React from 'react';
import { render, RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export interface MockVsCodeApi {
    messages: unknown[];
    state: unknown;
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

let _api: MockVsCodeApi | null = null;

declare global {
    var acquireVsCodeApi: (() => MockVsCodeApi | null) | undefined;
}

/** Install a fresh mock VS Code API and return it. Call before each render. */
export function createMockVsCodeApi(initialState?: unknown): MockVsCodeApi {
    _api = {
        messages: [],
        state: initialState,
        postMessage(msg: unknown) { this.messages.push(msg); },
        getState() { return this.state; },
        setState(state: unknown) { this.state = state; },
    };
    // Inject into global so platform.ts singleton picks it up.
    globalThis.acquireVsCodeApi = () => _api;
    return _api;
}

/** Send a message from the extension to the webview (fires a 'message' event on window). */
export function sendToWebview(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', { data }));
}

/** Wrapper that provides the VS Code API context to a component tree. */
export function renderWithVscode(ui: React.ReactElement): RenderResult & { api: MockVsCodeApi } {
    const api = createMockVsCodeApi();
    const result = render(ui);
    return { ...result, api };
}

/** Shorthand: create user-event instance. */
export function createUser() {
    return userEvent.setup();
}
