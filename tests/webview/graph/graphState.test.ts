import { describe, expect, it } from 'vitest';
import type { GraphCommit, GraphData } from '../../../src/protocol/graph/types';
import { createInitialGraphState, reduceGraphState } from '../../../src/webview/features/graph/graphState';

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
});
