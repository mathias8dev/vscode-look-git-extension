import { describe, expect, it } from 'vitest';
import type { HistoryCommit } from '../../../src/protocol/history/types';
import { createInitialHistoryState, reduceHistoryState } from '../../../src/webview/features/history/historyState';

describe('historyState', () => {
    it('replaces commits for the first page', () => {
        const state = reduceHistoryState(createInitialHistoryState(), {
            type: 'message',
            message: {
                type: 'history/data',
                data: {
                    commits: [commit('a111111', 'feat: first')],
                    page: { offset: 0, limit: 50 },
                    hasMore: true,
                },
            },
        });

        expect(state.commits.map((item) => item.message)).toEqual(['feat: first']);
        expect(state.loading).toBe(false);
        expect(state.hasMore).toBe(true);
        expect(state.loadedCount).toBe(1);
    });

    it('appends later pages without duplicate commits', () => {
        const first = reduceHistoryState(createInitialHistoryState(), {
            type: 'message',
            message: {
                type: 'history/data',
                data: {
                    commits: [commit('a111111', 'feat: first')],
                    page: { offset: 0, limit: 1 },
                    hasMore: true,
                },
            },
        });
        const loadingMore = reduceHistoryState(first, { type: 'startLoadMore' });
        const next = reduceHistoryState(loadingMore, {
            type: 'message',
            message: {
                type: 'history/dataResponse',
                requestId: 'history-test-1',
                data: {
                    commits: [commit('a111111', 'feat: first'), commit('b222222', 'fix: second')],
                    page: { offset: 1, limit: 2 },
                    hasMore: false,
                },
            },
        });

        expect(next.commits.map((item) => item.hash)).toEqual(['a111111', 'b222222']);
        expect(next.loadingMore).toBe(false);
        expect(next.hasMore).toBe(false);
    });

    it('clears stale selection when a refreshed page no longer contains the commit', () => {
        const selected = reduceHistoryState({
            ...createInitialHistoryState(),
            commits: [commit('a111111', 'feat: first')],
            expandedHashes: ['a111111'],
        }, {
            type: 'message',
            message: {
                type: 'history/data',
                data: {
                    commits: [commit('b222222', 'fix: second')],
                    page: { offset: 0, limit: 50 },
                    hasMore: false,
                },
            },
        });

        expect(selected.expandedHashes).toEqual([]);
    });

    it('marks selected commits as loading until details arrive', () => {
        const toggled = reduceHistoryState({
            ...createInitialHistoryState(),
            commits: [commit('a111111', 'feat: first')],
        }, { type: 'toggleCommit', hash: 'a111111' });

        expect(toggled.expandedHashes).toContain('a111111');
        // detailsLoadingHash is set by the useEffect via startLoadingDetails, not by toggleCommit
        const selected = reduceHistoryState(toggled, { type: 'startLoadingDetails', hash: 'a111111' });
        expect(selected.detailsLoadingHash).toBe('a111111');

        const loaded = reduceHistoryState(selected, {
            type: 'message',
            message: {
                type: 'history/commitDetailsResponse',
                requestId: 'history-details-1',
                details: {
                    hash: 'a111111',
                    fullMessage: 'feat: first',
                    files: [{ status: 'M', filePath: 'src/a.ts' }],
                },
            },
        });

        expect(loaded.detailsLoadingHash).toBeUndefined();
        expect(loaded.detailsByHash.a111111?.files).toEqual([{ status: 'M', filePath: 'src/a.ts' }]);
    });

    it('does not reload details already cached for a commit', () => {
        const selected = reduceHistoryState({
            ...createInitialHistoryState(),
            commits: [commit('a111111', 'feat: first')],
            detailsByHash: {
                a111111: {
                    hash: 'a111111',
                    fullMessage: 'feat: first',
                    files: [{ status: 'M', filePath: 'src/a.ts' }],
                },
            },
        }, { type: 'toggleCommit', hash: 'a111111' });

        expect(selected.detailsLoadingHash).toBeUndefined();
    });

    it('selects commits requested by extension messages', () => {
        const selected = reduceHistoryState({
            ...createInitialHistoryState(),
            commits: [commit('a111111', 'feat: first')],
        }, {
            type: 'message',
            message: { type: 'history/selectCommit', hash: 'a111111' },
        });

        expect(selected.expandedHashes).toContain('a111111');
        // detailsLoadingHash is set by startLoadingDetails (dispatched from useEffect)
        expect(selected.detailsLoadingHash).toBeUndefined();
    });

    it('stops details loading on errors', () => {
        const state = reduceHistoryState({
            ...createInitialHistoryState(),
            detailsLoadingHash: 'a111111',
        }, {
            type: 'message',
            message: {
                type: 'history/error',
                message: 'failed',
                error: {
                    code: 'refreshFailed',
                    message: 'failed',
                    operation: 'history/commitDetails',
                    recoverable: true,
                },
            },
        });

        expect(state.detailsLoadingHash).toBeUndefined();
    });

    it('resets when repository context changes', () => {
        const state = reduceHistoryState({
            ...createInitialHistoryState(),
            commits: [commit('a111111', 'feat: first')],
            loading: false,
        }, {
            type: 'message',
            message: {
                type: 'repo/contextChanged',
                context: { id: 'repo-2', cwd: '/repo', kind: 'main', label: 'repo' },
            },
        });

        expect(state).toEqual(createInitialHistoryState());
    });

    it('stores protocol errors', () => {
        const state = reduceHistoryState(createInitialHistoryState(), {
            type: 'message',
            message: {
                type: 'history/error',
                message: 'failed',
                error: {
                    code: 'refreshFailed',
                    message: 'failed',
                    operation: 'history/refresh',
                    recoverable: true,
                },
            },
        });

        expect(state.error?.message).toBe('failed');
        expect(state.loading).toBe(false);
    });
});

function commit(hash: string, message: string): HistoryCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName: 'Ada',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
    };
}
