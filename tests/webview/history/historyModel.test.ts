import { describe, expect, it } from 'vitest';
import type { HistoryCommit } from '@protocol/history/types';
import { filterHistoryCommits, historyEmptyLabel, selectedHistoryCommit } from '@webview/features/history/historyModel';

describe('historyModel', () => {
    it('filters commits by message, hash and author', () => {
        const commits = [
            commit('abc123456789', 'feat: add graph', 'Ada'),
            commit('def123456789', 'fix: repair history', 'Grace'),
        ];

        expect(filterHistoryCommits(commits, 'graph').map((item) => item.hash)).toEqual(['abc123456789']);
        expect(filterHistoryCommits(commits, 'def1234').map((item) => item.hash)).toEqual(['def123456789']);
        expect(filterHistoryCommits(commits, 'grace').map((item) => item.hash)).toEqual(['def123456789']);
    });

    it('filters commits by local and remote ref names', () => {
        const commits = [
            {
                ...commit('abc123456789', 'feat: add graph', 'Ada'),
                refs: [{ name: 'origin/experimental', kind: 'remote' as const }],
            },
            commit('def123456789', 'fix: repair history', 'Grace'),
        ];

        expect(filterHistoryCommits(commits, 'origin/experimental').map((item) => item.hash)).toEqual(['abc123456789']);
    });

    it('finds the selected commit', () => {
        const commits = [commit('abc123456789', 'feat: add graph', 'Ada')];

        expect(selectedHistoryCommit(commits, 'abc123456789')?.message).toBe('feat: add graph');
        expect(selectedHistoryCommit(commits, 'missing')).toBeUndefined();
    });

    it('returns an empty label for filtered and unfiltered states', () => {
        expect(historyEmptyLabel([], '')).toBe('No commits');
        expect(historyEmptyLabel([commit('abc123456789', 'feat: add graph', 'Ada')], 'missing')).toBe('No matching commits');
    });
});

function commit(hash: string, message: string, authorName: string): HistoryCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName,
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
        refs: [],
    };
}
