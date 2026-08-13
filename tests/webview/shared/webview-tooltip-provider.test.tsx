// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebviewTooltipProvider } from '@webview/shared/webview-tooltip-provider';

describe('WebviewTooltipProvider', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('replaces the delayed native title with a fast hover tooltip', () => {
        vi.useFakeTimers();
        render(
            <WebviewTooltipProvider>
                <button type="button" title="Refresh repository">Refresh</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Refresh' });

        fireEvent.pointerOver(button);

        expect(button).not.toHaveAttribute('title');
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

        act(() => vi.advanceTimersByTime(249));
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('tooltip')).toHaveTextContent('Refresh repository');

        fireEvent.pointerOut(button, { relatedTarget: document.body });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Refresh repository');
    });

    it('shows keyboard-focused tooltips immediately and restores existing descriptions', () => {
        render(
            <WebviewTooltipProvider>
                <button type="button" title="Push branch" aria-describedby="branch-state">Push</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Push' });

        fireEvent.focusIn(button);

        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Push branch');
        expect(button.getAttribute('aria-describedby')).toBe(`branch-state ${tooltip.id}`);

        fireEvent.focusOut(button, { relatedTarget: document.body });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Push branch');
        expect(button).toHaveAttribute('aria-describedby', 'branch-state');
    });

    it('switches from a titled row to a more specific titled action', () => {
        vi.useFakeTimers();
        render(
            <WebviewTooltipProvider>
                <div title=".github/workflows/remote-linux.yml">
                    <button type="button" title="Open file">Open<span data-testid="open-icon" /></button>
                </div>
            </WebviewTooltipProvider>,
        );
        const row = screen.getByTitle('.github/workflows/remote-linux.yml');
        const button = screen.getByRole('button', { name: 'Open' });

        fireEvent.pointerOver(row);
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByRole('tooltip')).toHaveTextContent('.github/workflows/remote-linux.yml');

        fireEvent.pointerOver(button);

        expect(row).not.toHaveAttribute('title');
        expect(button).not.toHaveAttribute('title');
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

        fireEvent.pointerOver(screen.getByTestId('open-icon'));
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByRole('tooltip')).toHaveTextContent('Open file');

        fireEvent.focusIn(button);
        expect(screen.getByRole('tooltip')).toHaveTextContent('Open file');

        fireEvent.pointerOut(button, { relatedTarget: document.body });
        expect(row).not.toHaveAttribute('title');
        expect(button).not.toHaveAttribute('title');

        fireEvent.focusOut(button, { relatedTarget: document.body });
        expect(row).toHaveAttribute('title', '.github/workflows/remote-linux.yml');
        expect(button).toHaveAttribute('title', 'Open file');
    });

    it('dismisses an open tooltip with Escape', () => {
        render(
            <WebviewTooltipProvider>
                <button type="button" title="Delete branch">Delete</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Delete' });

        fireEvent.focusIn(button);
        expect(screen.getByRole('tooltip')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(button).not.toHaveAttribute('title');

        fireEvent.focusOut(button, { relatedTarget: document.body });
        expect(button).toHaveAttribute('title', 'Delete branch');
    });
});
