// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizablePanel } from '../../../src/webview/shared/ResizablePanel';
import { ResizeAxis } from '../../../src/webview/shared/resizeAxis';
import { ResizeHandleSide } from '../../../src/webview/shared/resizeHandleSide';

describe('ResizablePanel', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.removeAttribute('style');
    });

    it('resizes an end-side panel with right and left arrows', async () => {
        const onSizeChange = vi.fn<(size: number) => void>();
        render(
            <ResizablePanel
                storageKey="lookGit.test.left"
                defaultSize={260}
                minSize={120}
                maxSize={560}
                axis={ResizeAxis.Horizontal}
                handleSide={ResizeHandleSide.End}
                ariaLabel="Resize test panel"
                title="Resize test panel"
                onSizeChange={onSizeChange}
            >
                {(style) => <div data-testid="panel" style={style} />}
            </ResizablePanel>,
        );

        const separator = screen.getByRole('separator', { name: 'Resize test panel' });
        expect(separator).toHaveAttribute('aria-valuenow', '260');

        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '276'));
        expect(localStorage.getItem('lookGit.test.left')).toBe('276');
        expect(onSizeChange).toHaveBeenCalledWith(276);

        fireEvent.keyDown(separator, { key: 'ArrowLeft' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '260'));
        expect(localStorage.getItem('lookGit.test.left')).toBe('260');
    });

    it('resizes a start-side panel in the opposite pointer direction', async () => {
        render(
            <ResizablePanel
                storageKey="lookGit.test.right"
                defaultSize={320}
                minSize={180}
                maxSize={720}
                axis={ResizeAxis.Horizontal}
                handleSide={ResizeHandleSide.Start}
                ariaLabel="Resize right panel"
                title="Resize right panel"
            >
                {(style) => <div data-testid="panel" style={style} />}
            </ResizablePanel>,
        );

        const separator = screen.getByRole('separator', { name: 'Resize right panel' });
        fireEvent.pointerDown(separator, { pointerId: 1, clientX: 100 });
        fireEvent.pointerMove(separator, { pointerId: 1, clientX: 60 });

        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '360'));

        fireEvent.pointerUp(separator, { pointerId: 1, clientX: 60 });

        expect(localStorage.getItem('lookGit.test.right')).toBe('360');
        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });

    it('resizes a start-side panel with left and right arrows', async () => {
        render(
            <ResizablePanel
                storageKey="lookGit.test.keyboard-right"
                defaultSize={320}
                minSize={180}
                maxSize={720}
                axis={ResizeAxis.Horizontal}
                handleSide={ResizeHandleSide.Start}
                ariaLabel="Resize keyboard right panel"
                title="Resize keyboard right panel"
            >
                {(style) => <div data-testid="panel" style={style} />}
            </ResizablePanel>,
        );

        const separator = screen.getByRole('separator', { name: 'Resize keyboard right panel' });
        fireEvent.keyDown(separator, { key: 'ArrowLeft' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '336'));

        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '320'));
    });

    it('resizes a vertical start-side panel with pointer and arrow keys', async () => {
        render(
            <ResizablePanel
                storageKey="lookGit.test.message"
                defaultSize={140}
                minSize={72}
                maxSize={420}
                axis={ResizeAxis.Vertical}
                handleSide={ResizeHandleSide.Start}
                ariaLabel="Resize message panel"
                title="Resize message panel"
            >
                {(style) => <div data-testid="panel" style={style} />}
            </ResizablePanel>,
        );

        const separator = screen.getByRole('separator', { name: 'Resize message panel' });
        expect(separator).toHaveAttribute('aria-orientation', 'horizontal');

        fireEvent.pointerDown(separator, { pointerId: 2, clientY: 100 });
        fireEvent.pointerMove(separator, { pointerId: 2, clientY: 70 });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '170'));

        fireEvent.pointerUp(separator, { pointerId: 2, clientY: 70 });
        expect(localStorage.getItem('lookGit.test.message')).toBe('170');

        fireEvent.keyDown(separator, { key: 'ArrowUp' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '186'));

        fireEvent.keyDown(separator, { key: 'ArrowDown' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '170'));
    });
});
