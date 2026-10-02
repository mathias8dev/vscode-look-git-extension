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

    it.each(['hover', 'focus'] as const)('dismisses an open %s tooltip when its target is removed from the DOM', async (trigger) => {
        vi.useFakeTimers();
        const { rerender } = render(
            <WebviewTooltipProvider>
                <button type="button" title="Refresh repository">Refresh</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Refresh' });

        if (trigger === 'hover') {
            fireEvent.pointerOver(button);
            act(() => vi.advanceTimersByTime(250));
        } else {
            fireEvent.focusIn(button);
        }
        expect(screen.getByRole('tooltip')).toHaveTextContent('Refresh repository');
        expect(screen.getByRole('tooltip')).toBeVisible();

        await act(async () => {
            rerender(
                <WebviewTooltipProvider>
                    <span>No changes</span>
                </WebviewTooltipProvider>,
            );
        });

        expect(button).not.toBeInTheDocument();
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    });

    it('cancels a pending tooltip when its target is removed from the DOM', async () => {
        vi.useFakeTimers();
        const { rerender } = render(
            <WebviewTooltipProvider>
                <button type="button" title="Refresh repository">Refresh</button>
            </WebviewTooltipProvider>,
        );
        fireEvent.pointerOver(screen.getByRole('button', { name: 'Refresh' }));

        await act(async () => {
            rerender(<WebviewTooltipProvider><span>No changes</span></WebviewTooltipProvider>);
        });

        expect(vi.getTimerCount()).toBe(0);
        act(() => vi.advanceTimersByTime(250));
        expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    });

    it('does not reveal a removed target before the removal notification is delivered', () => {
        vi.useFakeTimers();
        render(<WebviewTooltipProvider><div data-testid="rows" /></WebviewTooltipProvider>);
        const button = document.createElement('button');
        button.title = 'Open file';
        screen.getByTestId('rows').append(button);
        fireEvent.pointerOver(button);

        act(() => {
            button.remove();
            vi.advanceTimersByTime(250);
        });

        expect(vi.getTimerCount()).toBe(0);
        expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Open file');
        expect(button).not.toHaveAttribute('aria-describedby');
    });

    it('dismisses a tooltip when an ancestor is removed without rerendering the provider', async () => {
        render(<WebviewTooltipProvider><div data-testid="rows" /></WebviewTooltipProvider>);
        const row = document.createElement('div');
        row.title = 'src/app.ts';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Open file';
        button.textContent = 'Open';
        row.append(button);
        screen.getByTestId('rows').append(row);
        fireEvent.focusIn(button);
        expect(screen.getByRole('tooltip')).toBeVisible();

        await act(async () => { row.remove(); });

        expect(button).not.toBeInTheDocument();
        expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Open file');
        expect(button).not.toHaveAttribute('aria-describedby');
        expect(row).toHaveAttribute('title', 'src/app.ts');
    });

    it('restores a removed target title and descriptions so it can be reused', async () => {
        const { container, rerender } = render(
            <WebviewTooltipProvider>
                <button type="button" title="Push branch" aria-describedby="branch-state">Push</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Push' });
        fireEvent.focusIn(button);

        await act(async () => {
            rerender(<WebviewTooltipProvider><span>No changes</span></WebviewTooltipProvider>);
        });

        expect(button).toHaveAttribute('title', 'Push branch');
        expect(button).toHaveAttribute('aria-describedby', 'branch-state');
        await act(async () => { container.append(button); });
        fireEvent.focusIn(button);
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Push branch');
        expect(button).toHaveAttribute('aria-describedby', `branch-state ${tooltip.id}`);

        fireEvent.focusOut(button, { relatedTarget: document.body });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Push branch');
        expect(button).toHaveAttribute('aria-describedby', 'branch-state');
    });

    it('keeps an open tooltip visible through unrelated DOM updates', async () => {
        const { rerender } = render(
            <WebviewTooltipProvider>
                <button type="button" title="Refresh repository">Refresh</button>
                <span>Loading</span>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Refresh' });
        fireEvent.focusIn(button);
        const tooltip = screen.getByRole('tooltip');

        await act(async () => {
            rerender(
                <WebviewTooltipProvider>
                    <button type="button" title="Refresh repository">Refresh</button>
                    <div>No changes</div>
                </WebviewTooltipProvider>,
            );
        });

        expect(screen.getByRole('button', { name: 'Refresh' })).toBe(button);
        expect(screen.getByRole('tooltip')).toBe(tooltip);
        expect(tooltip).toBeVisible();
        expect(button).not.toHaveAttribute('title');
    });

    it('cleans up pending tooltips and temporary attributes when the provider unmounts', () => {
        vi.useFakeTimers();
        const { unmount } = render(
            <WebviewTooltipProvider>
                <button type="button" title="Refresh repository">Refresh</button>
            </WebviewTooltipProvider>,
        );
        const button = screen.getByRole('button', { name: 'Refresh' });
        fireEvent.pointerOver(button);

        unmount();

        expect(vi.getTimerCount()).toBe(0);
        act(() => vi.advanceTimersByTime(250));
        expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
        expect(button).toHaveAttribute('title', 'Refresh repository');
        expect(button).not.toHaveAttribute('aria-describedby');
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
