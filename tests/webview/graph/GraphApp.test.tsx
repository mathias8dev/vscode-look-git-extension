// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockVsCodeApi, sendToWebview } from '../../helpers/webviewRuntime';

describe('GraphApp', () => {
    beforeEach(() => {
        vi.resetModules();
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
        localStorage.clear();
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

    it('exposes the branch panel splitter as a keyboard-resizable separator', async () => {
        createMockVsCodeApi();
        const { GraphApp } = await import('../../../src/webview/graph/GraphApp');

        render(<GraphApp />);

        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        expect(separator).toHaveAttribute('tabindex', '0');
        expect(separator).toHaveAttribute('aria-orientation', 'vertical');
        expect(separator).toHaveAttribute('aria-valuemin', '120');
        expect(separator).toHaveAttribute('aria-valuemax', '960');
        expect(separator).toHaveAttribute('aria-valuenow', '260');

        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '276'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('276');

        fireEvent.keyDown(separator, { key: 'Home' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '120'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('120');

        fireEvent.keyDown(separator, { key: 'End' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '960'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('960');
    });

    it('restores document styles and persists the branch panel width after pointer resize', async () => {
        createMockVsCodeApi();
        const { GraphApp } = await import('../../../src/webview/graph/GraphApp');

        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'text';
        render(<GraphApp />);

        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        fireEvent.pointerDown(separator, { pointerId: 1, clientX: 100 });
        expect(document.body.style.cursor).toBe('col-resize');
        expect(document.body.style.userSelect).toBe('none');

        fireEvent.pointerMove(separator, { pointerId: 1, clientX: 140 });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '300'));

        fireEvent.pointerUp(separator, { pointerId: 1, clientX: 140 });
        await waitFor(() => expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('300'));
        expect(document.body.style.cursor).toBe('default');
        expect(document.body.style.userSelect).toBe('text');
    });

    it('cleans document resize state when the graph unmounts during a drag', async () => {
        createMockVsCodeApi();
        const { GraphApp } = await import('../../../src/webview/graph/GraphApp');

        const { unmount } = render(<GraphApp />);
        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        fireEvent.pointerDown(separator, { pointerId: 2, clientX: 100 });

        expect(document.body.style.cursor).toBe('col-resize');
        expect(document.body.style.userSelect).toBe('none');

        unmount();

        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });

    it('exposes a resizable separator for the commit details panel', async () => {
        createMockVsCodeApi();
        const { GraphApp } = await import('../../../src/webview/graph/GraphApp');

        render(<GraphApp />);
        sendToWebview({ type: 'graph/selectCommit', hash: 'abcdef1234567890' });

        const separator = await screen.findByRole('separator', { name: 'Resize commit details panel' });
        expect(separator).toHaveAttribute('aria-valuemin', '180');
        expect(separator).toHaveAttribute('aria-valuemax', '720');
        expect(separator).toHaveAttribute('aria-valuenow', '320');

        fireEvent.keyDown(separator, { key: 'ArrowLeft' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '336'));
        expect(localStorage.getItem('lookGit.commitDetailsPanelWidth')).toBe('336');
    });
});

class MockResizeObserver implements ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
}
