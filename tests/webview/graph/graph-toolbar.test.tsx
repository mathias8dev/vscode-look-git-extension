// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphToolbar } from '@webview/features/graph/graph-toolbar';

describe('GraphToolbar branch dropdown', () => {
    it('searches local and remote branches and can restore all branches', () => {
        const onBranchFilterChange = vi.fn();
        const { container } = render(<GraphToolbar filters={{}} selectedBranchFilter="main" branches={[
            { name: 'main', hash: 'a', isCurrent: true, isRemote: false },
            { name: 'feature/élan', hash: 'b', isCurrent: false, isRemote: false },
            { name: 'upstream/topic', hash: 'c', isCurrent: false, isRemote: true },
        ]} onFiltersChange={() => undefined} onBranchFilterChange={onBranchFilterChange} onRefresh={() => undefined} />);
        const trigger = screen.getByRole('combobox', { name: 'Filter by branch' });
        expect(container.querySelector('select')).toBeNull();
        expect(trigger).toHaveTextContent('main');
        fireEvent.click(trigger);
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search filter by branch' }), { target: { value: 'UPSTREAM' } });
        expect(screen.getAllByRole('option')).toHaveLength(1);
        fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search filter by branch' }), { key: 'Enter' });
        expect(onBranchFilterChange).toHaveBeenCalledWith('upstream/topic');
        fireEvent.click(trigger);
        expect(screen.getByRole('searchbox', { name: 'Search filter by branch' })).toHaveValue('');
        fireEvent.click(screen.getByRole('option', { name: 'All branches' }));
        expect(onBranchFilterChange).toHaveBeenLastCalledWith(undefined);
    });
});
