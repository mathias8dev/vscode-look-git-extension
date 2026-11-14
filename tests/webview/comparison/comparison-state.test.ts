import { describe, expect, it } from 'vitest';
import { ComparisonMode } from '@protocol/comparison/types';
import { initialComparisonState, reduceComparisonState } from '@webview/features/comparison/comparison-state';
import { comparisonSnapshot, comparisonStateFixture } from '@tests/helpers/comparison-state-fixture';

describe('comparison state', () => {
    it('ignores stale responses and only applies the active request', () => {
        const state = reduceComparisonState(initialComparisonState, { type: 'started', channel: 'comparison', append: false, request: { type: 'comparison/dataRequest', requestId: 'active', baseBranch: 'main', headBranch: 'feature', mode: ComparisonMode.SinceDivergence } });
        expect(reduceComparisonState(state, { type: 'message', message: { type: 'comparison/dataResponse', requestId: 'old', snapshot: comparisonSnapshot } })).toBe(state);
        const ready = reduceComparisonState(state, { type: 'message', message: { type: 'comparison/dataResponse', requestId: 'active', snapshot: comparisonSnapshot } });
        expect(ready.snapshot).toBe(comparisonSnapshot); expect(ready.selectedFile).toBe('src/login.ts');
    });
    it('preserves review markers for the same pinned revisions', () => {
        const state = comparisonStateFixture();
        const reviewed = reduceComparisonState(state, { type: 'review', path: 'src/login.ts' });
        expect(reviewed.reviewed).toHaveLength(1);
        expect(reduceComparisonState(reviewed, { type: 'review', path: 'src/login.ts' }).reviewed).toEqual([]);
    });
    it('invalidates pending commit details immediately when another commit is selected', () => {
        const state = reduceComparisonState(comparisonStateFixture(), { type: 'started', channel: 'details', append: false, request: { type: 'comparison/detailsRequest', requestId: 'old-details', snapshotId: 'snapshot', hash: 'b'.repeat(40), search: '' } });
        const selected = reduceComparisonState(state, { type: 'selectCommit', hash: 'd'.repeat(40) });
        expect(selected.pending.details).toBeUndefined(); expect(selected.details).toBeUndefined();
        expect(reduceComparisonState(selected, { type: 'message', message: { type: 'comparison/detailsResponse', requestId: 'old-details', search: '', details: { hash: 'b'.repeat(40), fullMessage: 'Old', files: { items: [], hasMore: false, totalCount: 0 } } } })).toBe(selected);
    });
    it('cancels without accepting a late response', () => {
        const state = { ...comparisonStateFixture(), pending: { open: { id: 'open', append: false } } };
        const cancelled = reduceComparisonState(state, { type: 'cancel', channel: 'open' });
        expect(reduceComparisonState(cancelled, { type: 'message', message: { type: 'comparison/opened', requestId: 'open' } })).toBe(cancelled);
    });
    it('appends subsequent pages and keeps the selected file', () => {
        const state = reduceComparisonState(comparisonStateFixture(), { type: 'started', channel: 'files', append: true, request: { type: 'comparison/filesRequest', requestId: 'more', snapshotId: 'snapshot', search: '', cursor: '3' } });
        const next = reduceComparisonState(state, { type: 'message', message: { type: 'comparison/filesResponse', requestId: 'more', search: '', files: { ...comparisonSnapshot.files, items: [{ status: 'A', filePath: 'next.ts', additions: 1, deletions: 0 }] } } });
        expect(next.files?.items).toHaveLength(4); expect(next.selectedFile).toBe('src/login.ts');
    });

    it('resets commit selection for a new search and ignores superseded results and details', () => {
        const initial = { ...comparisonStateFixture(), pending: { details: { id: 'old-details', append: false } } };
        const old = reduceComparisonState(initial, { type: 'started', channel: 'commits', append: false,
            request: { type: 'comparison/commitsRequest', requestId: 'old', snapshotId: 'snapshot', search: 'old' } });
        const state = reduceComparisonState(old, { type: 'started', channel: 'commits', append: false,
            request: { type: 'comparison/commitsRequest', requestId: 'current', snapshotId: 'snapshot', search: 'contracts' } });
        expect(state.commitSearch).toBe('contracts');
        expect(state.commits).toBeUndefined(); expect(state.selectedCommit).toBeUndefined(); expect(state.pending.details).toBeUndefined();
        expect(reduceComparisonState(state, { type: 'message', message: { type: 'comparison/commitsResponse', requestId: 'old', commits: comparisonSnapshot.commits } })).toBe(state);
        const next = reduceComparisonState(state, { type: 'message', message: { type: 'comparison/commitsResponse', requestId: 'current', commits: { ...comparisonSnapshot.commits, items: [comparisonSnapshot.commits.items[1]!] } } });
        expect(next.selectedCommit).toBe('d'.repeat(40));
        expect(reduceComparisonState(next, { type: 'message', message: { type: 'comparison/detailsResponse', requestId: 'old-details', search: '', details: { hash: 'b'.repeat(40), fullMessage: 'Old', files: { items: [], hasMore: false, totalCount: 0 } } } })).toBe(next);
    });
});
