// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GraphTable } from '../../../src/webview/features/graph/GraphTable';

class TestResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

describe('GraphTable column resizing', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.removeAttribute('style');
        Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    });

    it('resizes graph columns with the keyboard and persists widths', async () => {
        renderGraphTable();

        const message = screen.getByRole('separator', { name: 'Resize message column' });
        const author = screen.getByRole('separator', { name: 'Resize author column' });
        const date = screen.getByRole('separator', { name: 'Resize date column' });

        expect(message).toHaveAttribute('aria-valuenow', '520');
        expect(author).toHaveAttribute('aria-valuenow', '120');
        expect(date).toHaveAttribute('aria-valuenow', '160');

        fireEvent.keyDown(message, { key: 'ArrowRight' });
        await waitFor(() => expect(message).toHaveAttribute('aria-valuenow', '536'));
        expect(localStorage.getItem('lookGit.graph.messageColumnWidth')).toBe('536');

        fireEvent.keyDown(author, { key: 'Home' });
        await waitFor(() => expect(author).toHaveAttribute('aria-valuenow', '80'));
        expect(localStorage.getItem('lookGit.graph.authorColumnWidth')).toBe('80');

        fireEvent.keyDown(date, { key: 'End' });
        await waitFor(() => expect(date).toHaveAttribute('aria-valuenow', '260'));
        expect(localStorage.getItem('lookGit.graph.dateColumnWidth')).toBe('260');
    });

    it('resizes a graph column by dragging', async () => {
        renderGraphTable();

        const date = screen.getByRole('separator', { name: 'Resize date column' });
        fireEvent.pointerDown(date, { pointerId: 1, clientX: 100 });
        fireEvent.pointerMove(date, { pointerId: 1, clientX: 140 });

        await waitFor(() => expect(date).toHaveAttribute('aria-valuenow', '200'));

        fireEvent.pointerUp(date, { pointerId: 1, clientX: 140 });

        expect(localStorage.getItem('lookGit.graph.dateColumnWidth')).toBe('200');
        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });
});

function renderGraphTable(): void {
    render(
        <GraphTable
            rows={[]}
            displayRows={[]}
            branches={[]}
            selectedHashes={[]}
            selectedWorktreePath={undefined}
            hasMore={false}
            loadingMore={false}
            onSelectCommit={() => undefined}
            onSelectWorktree={() => undefined}
            onContextTarget={() => undefined}
            onLoadMore={() => undefined}
            onBranchDoubleClick={() => undefined}
            onMoveFocus={() => undefined}
        />,
    );
}
