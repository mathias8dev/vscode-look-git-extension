// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BranchDetails } from '@protocol/graph/types';
import { BranchDetailsPanel } from '@webview/features/graph/branch-details-panel';

describe('BranchDetailsPanel', () => {
    it('renders tracking, parent commits, and recent commits', () => {
        const onSelectCommit = vi.fn<(hash: string) => void>();
        render(
            <BranchDetailsPanel
                details={details()}
                loading={false}
                loadingMore={false}
                onClose={() => undefined}
                onLoadMore={() => undefined}
                onSelectCommit={onSelectCommit}
            />,
        );

        expect(screen.getAllByText('feature/auth')).toHaveLength(2);
        expect(screen.getByText('origin')).toBeTruthy();
        expect(screen.getByText('git@example.test:team/repo.git')).toBeTruthy();
        expect(screen.getByText('origin/feature/auth')).toBeTruthy();
        expect(screen.getByText('2 ahead, 1 behind')).toBeTruthy();
        expect(screen.getByText('Parent commit')).toBeTruthy();
        expect(screen.getByText('parent123')).toBeTruthy();
        expect(screen.getByText('Not recorded by Git')).toBeTruthy();

        fireEvent.click(screen.getByText('feat(graph): show branch details'));
        expect(onSelectCommit).toHaveBeenCalledWith('abcdef123456');
    });

    it('loads the next page only when more commits exist', () => {
        const onLoadMore = vi.fn<() => void>();
        render(
            <BranchDetailsPanel
                details={details()}
                loading={false}
                loadingMore={false}
                onClose={() => undefined}
                onLoadMore={onLoadMore}
                onSelectCommit={() => undefined}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        expect(onLoadMore).toHaveBeenCalledOnce();
    });
});

function details(): BranchDetails {
    const head = {
        hash: 'abcdef123456',
        shortHash: 'abcdef1',
        message: 'feat(graph): show branch details',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2026-08-11T10:00:00Z',
        parentHashes: ['parent123'],
        refs: ['feature/auth'],
    };
    return {
        name: 'feature/auth',
        isRemote: false,
        isCurrent: true,
        hash: head.hash,
        remote: 'origin',
        remoteUrl: 'git@example.test:team/repo.git',
        upstream: 'origin/feature/auth',
        ahead: 2,
        behind: 1,
        head,
        commits: [head],
        hasMore: true,
        loadedCount: 1,
    };
}
