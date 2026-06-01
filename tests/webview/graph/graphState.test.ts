import { describe, expect, it } from 'vitest';
import type { GraphCommit, GraphData, WorktreeWip } from '../../../src/protocol/graph/types';
import { buildDisplayRows, createInitialGraphState, reduceGraphState } from '../../../src/webview/features/graph/graphState';
import type { GraphRow, LaneData } from '../../../src/webview/features/graph/layout/assignGraphLanes';

function commit(hash: string, parents: readonly string[] = []): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: hash,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: parents,
        refs: [],
    };
}

function graphData(commits: readonly GraphCommit[], loadedCount: number, hasMore: boolean): GraphData {
    return {
        branches: [],
        tags: [],
        commits,
        currentBranch: 'main',
        currentUser: 'Test User',
        hasMore,
        loadedCount,
        totalCount: commits.length,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
    };
}

function wip(path: string, head: string): WorktreeWip {
    return {
        path,
        head,
        branch: undefined,
        staged: 1,
        unstaged: 0,
        untracked: 0,
        conflicts: 0,
    };
}

function row(hash: string, laneData: LaneData): GraphRow {
    return { commit: commit(hash), laneData };
}

function laneData(lines: LaneData['lines'] = []): LaneData {
    return {
        lane: 1,
        color: '#79b8ff',
        isPrimary: false,
        lines,
    };
}

describe('graphState', () => {
    it('tracks load-more requests and clears them when graph data arrives', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: 'graph-1',
                data: graphData([commit('b', ['a'])], 1, true),
            },
        });

        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });
        expect(loadingMore.loadingMore).toBe(true);

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: 'graph-2',
                data: graphData([commit('b', ['a']), commit('a')], 2, false),
            },
        });

        expect(next.loadingMore).toBe(false);
        expect(next.loadedCount).toBe(2);
        expect(next.rows).toHaveLength(2);
        expect(next.hasMore).toBe(false);
    });

    it('ignores commit details responses for commits that are no longer selected', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'selected' });
        const stale = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/commitDetailsResponse',
                requestId: 'details-1',
                hash: 'stale',
                fullMessage: 'old details',
                files: [],
            },
        });

        expect(stale.selectedHash).toBe('selected');
        expect(stale.commitDetails).toBeUndefined();
        expect(stale.detailsLoading).toBe(true);
    });

    it('loads worktree details independently from commit selection', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectWorktree', path: '/repo/.worktrees/topic' });
        const stale = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/worktreeDetailsResponse',
                requestId: 'details-1',
                path: '/repo/.worktrees/other',
                head: 'other',
                branch: 'feature/other',
                files: [],
            },
        });
        const loaded = reduceGraphState(stale, {
            type: 'message',
            message: {
                type: 'graph/worktreeDetailsResponse',
                requestId: 'details-2',
                path: '/repo/.worktrees/topic',
                head: 'head',
                branch: 'feature/topic',
                files: [{ status: '?', filePath: 'src/new.ts' }],
            },
        });

        expect(selected.selectedHash).toBeUndefined();
        expect(selected.selectedWorktreePath).toBe('/repo/.worktrees/topic');
        expect(selected.detailsLoading).toBe(true);
        expect(stale.commitDetails).toBeUndefined();
        expect(loaded.commitDetails).toEqual({
            kind: 'worktree',
            hash: 'head',
            fullMessage: 'feature/topic',
            files: [{ status: '?', filePath: 'src/new.ts' }],
            path: '/repo/.worktrees/topic',
            branch: 'feature/topic',
        });
    });

    it('tracks multiple selected commits', () => {
        const first = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'a' });
        const added = reduceGraphState(first, { type: 'toggleCommitSelection', hash: 'b' });
        const removed = reduceGraphState(added, { type: 'toggleCommitSelection', hash: 'a' });

        expect(added.selectedHashes).toEqual(['a', 'b']);
        expect(added.selectedHash).toBe('b');
        expect(removed.selectedHashes).toEqual(['b']);
        expect(removed.selectedHash).toBe('b');
    });

    it('selects commit ranges without changing the anchor', () => {
        const anchored = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'a' });
        const ranged = reduceGraphState(anchored, { type: 'selectCommitRange', focusHash: 'd', hashes: ['a', 'b', 'c', 'd'] });

        expect(ranged.selectedHashes).toEqual(['a', 'b', 'c', 'd']);
        expect(ranged.selectedHash).toBe('d');
        expect(ranged.selectionAnchorHash).toBe('a');
    });

    it('clears graph errors', () => {
        const failed = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/error',
                message: 'Graph failed',
                error: {
                    code: 'gitOperationFailed',
                    message: 'Graph failed',
                    operation: 'graph/dataRequest',
                    recoverable: true,
                },
            },
        });

        const cleared = reduceGraphState(failed, { type: 'clearError' });

        expect(failed.error?.message).toBe('Graph failed');
        expect(cleared.error).toBeUndefined();
    });

    it('keeps multiple worktree WIP rows that point at the same commit', () => {
        const rows = [row('head', laneData())];
        const displayRows = buildDisplayRows(rows, [
            wip('/repo/worktrees/a', 'head'),
            wip('/repo/worktrees/b', 'head'),
        ]);

        expect(displayRows.map((displayRow) => displayRow.kind)).toEqual(['wip', 'wip', 'commit']);
        expect(displayRows.filter((displayRow) => displayRow.kind === 'wip').map((displayRow) => displayRow.wip.path)).toEqual([
            '/repo/worktrees/a',
            '/repo/worktrees/b',
        ]);
    });

    it('uses synthetic lane lines for WIP rows and connects the real commit below them', () => {
        const parentLine = {
            fromLane: 1,
            toLane: 2,
            color: '#79b8ff',
            type: 'fork-right',
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        } satisfies LaneData['lines'][number];
        const displayRows = buildDisplayRows([row('head', laneData([parentLine]))], [wip('/repo/wt', 'head')]);
        const wipRow = displayRows[0];
        const commitRow = displayRows[1];

        expect(wipRow?.kind).toBe('wip');
        if (wipRow?.kind !== 'wip') { throw new Error('Expected WIP row.'); }
        expect(wipRow.laneData.lines).toEqual([expect.objectContaining({
            fromLane: 1,
            toLane: 1,
            type: 'straight',
            startY: 'center',
            endY: 'bottom',
        })]);

        expect(commitRow?.kind).toBe('commit');
        if (commitRow?.kind !== 'commit') { throw new Error('Expected commit row.'); }
        expect(commitRow.row.laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 1,
            toLane: 1,
            type: 'straight',
            startY: 'top',
            endY: 'center',
        }));
        expect(commitRow.row.laneData.lines).toContain(parentLine);
    });
});
