// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitDetailsPanel } from '../../../src/webview/features/graph/CommitDetailsPanel';
import type { CommitDetails } from '../../../src/webview/features/graph/graphState';

describe('CommitDetailsPanel', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('filters changed files from the details panel search field', () => {
        renderPanel(detailsFor('abcdef123456'));

        expect(screen.getByText('src')).toBeTruthy();
        expect(screen.getByText('app.ts')).toBeTruthy();
        expect(screen.getByText('docs')).toBeTruthy();
        expect(screen.getByText('README.md')).toBeTruthy();

        fireEvent.change(searchInput(), { target: { value: 'readme' } });

        expect(screen.queryByText('src')).toBeNull();
        expect(screen.queryByText('app.ts')).toBeNull();
        expect(screen.getByText('docs')).toBeTruthy();
        expect(screen.getByText('README.md')).toBeTruthy();
    });

    it('shows an empty state when no changed files match the details search', () => {
        renderPanel(detailsFor('abcdef123456'));

        fireEvent.change(searchInput(), { target: { value: 'missing' } });

        expect(screen.getByText('No files match')).toBeTruthy();
        expect(screen.queryByText('app.ts')).toBeNull();
    });

    it('clears the details file search when the selected commit changes', async () => {
        const { rerender } = renderPanel(detailsFor('abcdef123456'));

        fireEvent.change(searchInput(), { target: { value: 'readme' } });
        expect(searchInput().value).toBe('readme');

        rerender(
            <CommitDetailsPanel
                details={detailsFor('fedcba654321')}
                loading={false}
                onClose={vi.fn()}
                onDiff={vi.fn()}
            />,
        );

        await waitFor(() => expect(searchInput().value).toBe(''));
        expect(screen.getByText('app.ts')).toBeTruthy();
    });

    it('resizes the commit message sub-panel', async () => {
        renderPanel(detailsFor('abcdef123456'));

        const separator = screen.getByRole('separator', { name: 'Resize commit message panel' });
        expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
        expect(separator).toHaveAttribute('aria-valuenow', '140');

        fireEvent.keyDown(separator, { key: 'ArrowUp' });

        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '156'));
        expect(localStorage.getItem('lookGit.commitDetailsMessagePanelHeight')).toBe('156');
    });
});

function renderPanel(details: CommitDetails) {
    return render(
        <CommitDetailsPanel
            details={details}
            loading={false}
            onClose={vi.fn()}
            onDiff={vi.fn()}
        />,
    );
}

function detailsFor(hash: string): CommitDetails {
    return {
        kind: 'commit',
        hash,
        fullMessage: 'feat(graph): update details files',
        files: [
            { status: 'M', filePath: 'src/app.ts' },
            { status: 'A', filePath: 'docs/README.md' },
            { status: 'M', filePath: 'fastlane/Fastfile' },
        ],
    };
}

function searchInput(): HTMLInputElement {
    const input = screen.getByRole('searchbox', { name: 'Search changed files' });
    if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected searchbox to be an input');
    }
    return input;
}
