// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, GraphCommit, GraphContextTarget, WorktreeInfo } from '../../../src/protocol/graph/types';
import { BranchPanel } from '../../../src/webview/features/graph/BranchPanel';
import { GraphTable } from '../../../src/webview/features/graph/GraphTable';
import { assignLanes } from '../../../src/webview/features/graph/layout/assignGraphLanes';
import type { DisplayRow } from '../../../src/webview/features/graph/graphState';

class TestResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

describe('graph native context menu targets', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    });

    it('marks branch rows as VS Code native context targets', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();

        render(
            <BranchPanel
                branches={[branch('feature/a')]}
                worktrees={[worktree('/repo/.worktrees/a', 'refs/heads/feature/a')]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={onContextTarget}
            />,
        );

        const row = screen.getByTitle('feature/a');
        const context = row.getAttribute('data-vscode-context') ?? '';

        expect(context).toContain('"webviewSection":"graphBranch"');
        expect(context).toContain('"graphBranchHasWorktree":true');

        fireEvent.contextMenu(row);

        expect(onContextTarget).toHaveBeenCalledWith({ kind: 'branch', branch: 'feature/a', isRemote: false });
    });

    it('marks worktree rows as VS Code native context targets', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        const onSelectWorktree = vi.fn<(path: string) => void>();

        render(
            <BranchPanel
                branches={[]}
                worktrees={[worktree('/repo/.worktrees/a', 'refs/heads/feature/a')]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={onSelectWorktree}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={onContextTarget}
            />,
        );

        const row = screen.getByTitle('/repo/.worktrees/a').closest('[data-vscode-context]');
        if (!(row instanceof HTMLElement)) { throw new Error('Expected worktree context row.'); }
        const context = row.getAttribute('data-vscode-context') ?? '';

        expect(context).toContain('"webviewSection":"graphWorktree"');
        expect(context).toContain('"graphWorktreeIsMain":false');

        fireEvent.contextMenu(row);

        expect(onSelectWorktree).toHaveBeenCalledWith('/repo/.worktrees/a');
        expect(onContextTarget).toHaveBeenCalledWith({ kind: 'worktree', path: '/repo/.worktrees/a' });
    });

    it('marks commit rows as VS Code native context targets with selected hashes', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        const onSelectCommit = vi.fn<(hash: string, mode: 'replace' | 'toggle' | 'range') => void>();
        const commits = [
            commit('head1234567890abcdef', ['base1234567890abcdef']),
            commit('base1234567890abcdef', []),
        ];
        const rows = assignLanes(commits);
        const displayRows: readonly DisplayRow[] = rows.map((row) => ({ kind: 'commit', row }));

        render(
            <GraphTable
                rows={rows}
                displayRows={displayRows}
                branches={[]}
                selectedHashes={['base1234567890abcdef']}
                selectedWorktreePath={undefined}
                hasMore={false}
                loadingMore={false}
                onSelectCommit={onSelectCommit}
                onSelectWorktree={() => undefined}
                onContextTarget={onContextTarget}
                onLoadMore={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );

        const row = screen.getByTitle('commit base1234567890abcdef');
        const context = row.getAttribute('data-vscode-context') ?? '';

        expect(context).toContain('"webviewSection":"graphCommit"');
        expect(context).toContain('"graphCommitCanGoToChild":true');
        expect(context).toContain('"graphCommitCanGoToParent":false');

        fireEvent.contextMenu(row);

        expect(onSelectCommit).not.toHaveBeenCalled();
        expect(onContextTarget).toHaveBeenCalledWith({
            kind: 'commit',
            hash: 'base1234567890abcdef',
            hashes: ['base1234567890abcdef'],
            childHash: 'head1234567890abcdef',
            parentHash: undefined,
            canUndoCommit: false,
        });
    });
});

function branch(name: string): BranchInfo {
    return {
        name,
        isRemote: false,
        isCurrent: false,
        hash: 'abc1234',
        ahead: 0,
        behind: 0,
    };
}

function worktree(worktreePath: string, branchName: string): WorktreeInfo {
    return {
        path: worktreePath,
        head: 'abc1234567890abcdef',
        branch: branchName,
        isMain: false,
        isDetached: false,
        isLocked: false,
    };
}

function commit(hash: string, parentHashes: readonly string[]): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: `commit ${hash}`,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes,
        refs: [],
    };
}
