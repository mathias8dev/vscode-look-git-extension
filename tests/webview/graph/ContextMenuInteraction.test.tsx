// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, GraphCommit, WorktreeInfo } from '../../../src/protocol/graph/types';
import type { BranchCommand, CommitCommand } from '../../../src/protocol/graph/messages';
import { BranchPanel } from '../../../src/webview/features/graph/BranchPanel';
import { GraphTable } from '../../../src/webview/features/graph/GraphTable';
import { assignLanes } from '../../../src/webview/features/graph/layout/assignGraphLanes';
import type { DisplayRow } from '../../../src/webview/features/graph/graphState';

class TestResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

describe('graph context menu interactions', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    });

    it('dispatches branch worktree commands from the branch context menu', () => {
        const onBranchCommand = vi.fn<(command: BranchCommand, branch: string, isRemote: boolean) => void>();

        render(
            <BranchPanel
                branches={[branch('feature/a')]}
                worktrees={[worktree('/repo/.worktrees/a', 'refs/heads/feature/a')]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={onBranchCommand}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onWorktreeCommand={() => undefined}
                onAddWorktree={() => undefined}
            />,
        );

        fireEvent.contextMenu(screen.getByTitle('feature/a'), { clientX: 12, clientY: 24 });
        fireEvent.click(screen.getByText('Open Branch Worktree'));

        expect(onBranchCommand).toHaveBeenCalledWith('openBranchWorktree', 'feature/a', false);
    });

    it('dispatches commit worktree commands from the commit context menu', () => {
        const onCommitCommand = vi.fn<(command: CommitCommand, hash: string, hashes: readonly string[]) => void>();
        const rows = assignLanes([commit('abc1234567890abcdef')]);
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
                onSelectCommit={() => undefined}
                onSelectWorktree={() => undefined}
                onCommitCommand={onCommitCommand}
                onLoadMore={() => undefined}
                onPostMessage={() => undefined}
            />,
        );

        fireEvent.contextMenu(screen.getByTitle('feat(graph): test context menu'), { clientX: 12, clientY: 24 });
        fireEvent.click(screen.getByText('Compare Commit with Worktree...'));

        expect(onCommitCommand).toHaveBeenCalledWith('compareCommitWithWorktree', 'abc1234567890abcdef', ['abc1234567890abcdef']);
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

function commit(hash: string): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: 'feat(graph): test context menu',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
        refs: [],
    };
}
