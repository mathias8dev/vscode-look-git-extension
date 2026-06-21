// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, GraphCommit, GraphContextTarget, WorktreeInfo } from '@protocol/graph/types';
import { BranchPanel } from '@webview/features/graph/branch-panel';
import { GraphTable } from '@webview/features/graph/graph-table';
import { layoutGraphRowsV4 } from '@webview/features/graph/layout/layout-graph-rows-v4';
import type { DisplayRow } from '@webview/features/graph/graph-state';

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
                submodules={[]}
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
        expect(context).toContain('"graphBranchHasUpstream":true');
        expect(context).toContain('"graphBranchCanPush":true');
        expect(context).toContain('"graphBranchCanPublish":false');
        expect(context).toContain('"graphBranchCanDelete":true');

        fireEvent.contextMenu(row);

        expect(onContextTarget).toHaveBeenCalledWith({
            kind: 'branch',
            branch: 'feature/a',
            isRemote: false,
            isCurrent: false,
            hasUpstream: true,
            canPush: true,
            canPublish: false,
            canDelete: true,
        });
    });

    it('marks worktree rows as VS Code native context targets', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        const onSelectWorktree = vi.fn<(path: string) => void>();

        render(
            <BranchPanel
                branches={[]}
                worktrees={[worktree('/repo/.worktrees/a', 'refs/heads/feature/a')]}
                submodules={[]}
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
        const rows = layoutGraphRowsV4(commits).rows;
        const displayRows: readonly DisplayRow[] = rows.map((row) => ({ kind: 'commit', row }));

        render(
            <GraphTable
                rows={rows}
                displayRows={displayRows}
                branches={[]}
                selectedHashes={['base1234567890abcdef', 'head1234567890abcdef']}
                selectedWorktreePath={undefined}
                hasMore={false}
                loadingMore={false}
                onSelectCommit={onSelectCommit}
                onSelectWorktree={() => undefined}
                onContextTarget={onContextTarget}
                onLoadMore={() => undefined}
                onBranchDoubleClick={() => undefined}
                onMoveFocus={() => undefined}
            />,
        );

        const row = screen.getByTitle(/commit base1234567890abcdef/);
        const context = row.getAttribute('data-vscode-context') ?? '';

        expect(context).toContain('"webviewSection":"graphCommit"');
        expect(context).toContain('"graphCommitCanGoToChild":true');
        expect(context).toContain('"graphCommitCanGoToParent":false');
        expect(context).toContain('"graphCommitCanCherryPick":true');
        expect(context).toContain('"graphCommitCanSquash":true');
        expect(context).toContain('"graphCommitHasMultipleSelectedCommits":true');
        expect(context).toContain('"graphCommitDisabledReason"');

        fireEvent.contextMenu(row);

        expect(onSelectCommit).not.toHaveBeenCalled();
        expect(onContextTarget).toHaveBeenCalledWith({
            kind: 'commit',
            hash: 'base1234567890abcdef',
            hashes: ['base1234567890abcdef', 'head1234567890abcdef'],
            childHash: 'head1234567890abcdef',
            parentHash: undefined,
            canUndoCommit: false,
            canCherryPick: true,
            canSquash: true,
        });
    });

    it('disables cherry-pick for mixed commit selections when one selected commit is already in current history', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        const commits = [
            commit('head1234567890abcdef', ['base1234567890abcdef'], false),
            commit('base1234567890abcdef', [], true),
        ];
        const rows = layoutGraphRowsV4(commits).rows;
        const displayRows: readonly DisplayRow[] = rows.map((row) => ({ kind: 'commit', row }));

        render(
            <GraphTable
                rows={rows}
                displayRows={displayRows}
                branches={[]}
                selectedHashes={['base1234567890abcdef', 'head1234567890abcdef']}
                selectedWorktreePath={undefined}
                hasMore={false}
                loadingMore={false}
                onSelectCommit={() => undefined}
                onSelectWorktree={() => undefined}
                onContextTarget={onContextTarget}
                onLoadMore={() => undefined}
                onBranchDoubleClick={() => undefined}
                onMoveFocus={() => undefined}
            />,
        );

        const row = screen.getByTitle(/commit base1234567890abcdef/);

        expect(row.getAttribute('data-vscode-context')).toContain('"graphCommitCanCherryPick":false');
        expect(row).toHaveAttribute('title', expect.stringContaining('Cherry-pick unavailable'));

        fireEvent.contextMenu(row);

        expect(onContextTarget).toHaveBeenCalledWith(expect.objectContaining({
            hash: 'base1234567890abcdef',
            canCherryPick: false,
            canSquash: true,
        }));
    });

    it('opens the commit context target from the keyboard context menu key', () => {
        const onContextTarget = vi.fn<(target: GraphContextTarget) => void>();
        const onSelectCommit = vi.fn<(hash: string, mode: 'replace' | 'toggle' | 'range') => void>();
        const commits = [commit('head1234567890abcdef', [])];
        const rows = layoutGraphRowsV4(commits).rows;
        const displayRows: readonly DisplayRow[] = rows.map((row) => ({ kind: 'commit', row }));

        render(
            <GraphTable
                rows={rows}
                displayRows={displayRows}
                branches={[]}
                selectedHashes={[]}
                selectedWorktreePath={undefined}
                hasMore={false}
                loadingMore={false}
                onSelectCommit={onSelectCommit}
                onSelectWorktree={() => undefined}
                onContextTarget={onContextTarget}
                onLoadMore={() => undefined}
                onBranchDoubleClick={() => undefined}
                onMoveFocus={() => undefined}
            />,
        );

        const row = screen.getByTitle(/commit head1234567890abcdef/);
        fireEvent.keyDown(row, { key: 'ContextMenu' });

        expect(onSelectCommit).toHaveBeenCalledWith('head1234567890abcdef', 'replace');
        expect(onContextTarget).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'commit',
            hash: 'head1234567890abcdef',
        }));
    });
});

function branch(name: string): BranchInfo {
    return {
        name,
        isRemote: false,
        isCurrent: false,
        hash: 'abc1234',
        upstream: 'origin/feature/a',
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

function commit(hash: string, parentHashes: readonly string[], canCherryPick = true): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: `commit ${hash}`,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes,
        refs: [],
        canCherryPick,
    };
}
