// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchPanel } from '@webview/features/graph/branch-panel';
import { comparisonBranchRef, reduceBranchComparisonSelection } from '@webview/features/graph/branch-comparison-selection';
import type { BranchInfo, GraphContextTarget } from '@protocol/graph/types';

describe('branch comparison selection', () => {
    afterEach(cleanup);
    const branches: readonly BranchInfo[] = [
        { name: 'feature/alpha', hash: 'a', isCurrent: false, isRemote: false },
        { name: 'upstream/beta', hash: 'b', isCurrent: false, isRemote: true },
        { name: 'main', hash: 'c', isCurrent: true, isRemote: false },
    ];
    function mount(selectedBranchFilter?: string) {
        const onCompareBranches = vi.fn<(baseRef: string, headRef: string) => void>();
        const onSelectBranch = vi.fn<(branch: string | undefined) => void>();
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        render(<BranchPanel branches={branches} worktrees={[]} submodules={[]} currentBranch="main"
            selectedBranchFilter={selectedBranchFilter} selectedWorktreePath={undefined}
            onSelectBranch={onSelectBranch} onCompareBranches={onCompareBranches}
            onBranchCommand={() => undefined} onFetch={() => undefined} onSelectWorktree={() => undefined}
            onOpenWorktree={() => undefined} onAddWorktree={() => undefined} onContextTarget={onContextTarget} />);
        return { onCompareBranches, onSelectBranch, onContextTarget };
    }

    it.each(['ctrlKey', 'metaKey'] as const)('selects local and remote branches with %s without changing the graph filter', modifier => {
        const { onCompareBranches, onSelectBranch } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'alpha' }), { [modifier]: true });
        expect(screen.getByRole('button', { name: 'Compare selected branches' })).toBeDisabled();
        expect(screen.getByLabelText('Comparison base')).toHaveTextContent('1');
        fireEvent.click(screen.getByRole('button', { name: 'beta' }), { [modifier]: true });
        expect(screen.getByLabelText('Branch to compare')).toHaveTextContent('2');
        expect(onSelectBranch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Compare selected branches' }));
        expect(onCompareBranches).toHaveBeenCalledWith('refs/heads/feature/alpha', 'refs/remotes/upstream/beta');
        fireEvent.click(screen.getByRole('button', { name: 'Clear branch comparison selection' }));
        expect(screen.queryByLabelText('Comparison base')).not.toBeInTheDocument();
    });

    it('adds a modified click to the ordinary selected branch and clears the pair on an ordinary click', () => {
        const { onCompareBranches, onSelectBranch } = mount('feature/alpha');
        fireEvent.click(screen.getByRole('button', { name: 'beta' }), { ctrlKey: true });
        fireEvent.click(screen.getByRole('button', { name: 'Compare selected branches' }));
        expect(onCompareBranches).toHaveBeenCalledWith('refs/heads/feature/alpha', 'refs/remotes/upstream/beta');
        fireEvent.click(screen.getByRole('button', { name: /beta/ }));
        expect(onSelectBranch).toHaveBeenCalledWith('upstream/beta');
        expect(screen.queryByLabelText('Comparison base')).not.toBeInTheDocument();
    });

    it('keeps the base and replaces the target when a third branch is selected', () => {
        const base = comparisonBranchRef(branches[0]!);
        const target = comparisonBranchRef(branches[1]!);
        expect(reduceBranchComparisonSelection([base, target], { type: 'toggle', ref: 'refs/heads/main' })).toEqual([base, 'refs/heads/main']);
        expect(reduceBranchComparisonSelection([base, target], { type: 'toggle', ref: base })).toEqual([target]);
        expect(reduceBranchComparisonSelection([base, target], { type: 'toggle', ref: target })).toEqual([base]);
    });

    it('preserves the selected pair on right-click and resets it on a branch outside the pair', () => {
        const { onContextTarget } = mount();
        const base = screen.getByRole('button', { name: 'alpha' });
        const target = screen.getByRole('button', { name: 'beta' });
        fireEvent.click(base, { ctrlKey: true });
        fireEvent.click(target, { ctrlKey: true });
        expect(base.getAttribute('data-vscode-context')).toContain('"graphBranchHasSelectedPair":true');
        expect(target.getAttribute('data-vscode-context')).toContain('"graphBranchHasSelectedPair":true');
        fireEvent.contextMenu(base);
        fireEvent.contextMenu(target);
        expect(onContextTarget).toHaveBeenLastCalledWith({ kind: 'branchPair', baseRef: 'refs/heads/feature/alpha', headRef: 'refs/remotes/upstream/beta' });
        expect(screen.getByLabelText('Comparison base')).toBeInTheDocument();
        const outside = screen.getByRole('button', { name: 'maincurrent branch' });
        expect(outside.getAttribute('data-vscode-context')).toContain('"graphBranchHasSelectedPair":false');
        fireEvent.contextMenu(outside);
        expect(onContextTarget).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'branch', branch: 'main' }));
        expect(screen.queryByLabelText('Comparison base')).not.toBeInTheDocument();
    });
});
