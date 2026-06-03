// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockVsCodeApi, sendToWebview } from '../../helpers/webviewRuntime';

describe('GraphApp', () => {
    beforeEach(() => {
        vi.resetModules();
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
        globalThis.ResizeObserver = MockResizeObserver;
    });

    it('applies live Look Git font-size changes', async () => {
        createMockVsCodeApi();
        const { GraphApp } = await import('../../../src/webview/graph/GraphApp');

        render(<GraphApp />);
        sendToWebview({ type: 'ui/fontSizeChanged', fontSize: 23 });

        await waitFor(() => expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('23px'));
        expect(document.documentElement.style.fontSize).toBe('23px');
        expect(document.body.style.fontSize).toBe('23px');
        expect(document.getElementById('root')?.style.fontSize).toBe('23px');
    });
});

class MockResizeObserver implements ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
}
