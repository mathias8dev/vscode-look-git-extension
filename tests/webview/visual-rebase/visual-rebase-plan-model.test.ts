import { describe, expect, it } from 'vitest';
import type { VisualRebaseCommit } from '@protocol/visual-rebase/types';
import { reorderVisualRebaseCommits } from '@webview/features/visual-rebase/visual-rebase-plan-model';

describe('reorderVisualRebaseCommits', () => {
    const commits = [
        commit('aaa111111111'),
        commit('bbb222222222'),
        commit('ccc333333333'),
    ];

    it('moves a commit after the target', () => {
        const reordered = reorderVisualRebaseCommits(commits, 'aaa111111111', 'ccc333333333', 'after');

        expect(reordered.map(({ hash }) => hash)).toEqual([
            'bbb222222222',
            'ccc333333333',
            'aaa111111111',
        ]);
    });

    it('moves a commit before the target', () => {
        const reordered = reorderVisualRebaseCommits(commits, 'ccc333333333', 'aaa111111111', 'before');

        expect(reordered.map(({ hash }) => hash)).toEqual([
            'ccc333333333',
            'aaa111111111',
            'bbb222222222',
        ]);
    });

    it('preserves the original collection when the order does not change', () => {
        expect(reorderVisualRebaseCommits(commits, 'aaa111111111', 'bbb222222222', 'before')).toBe(commits);
        expect(reorderVisualRebaseCommits(commits, 'missing', 'bbb222222222', 'after')).toBe(commits);
    });
});

function commit(hash: string): VisualRebaseCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: hash,
        authorName: 'Ada',
        authorDate: '2026-06-15T00:00:00Z',
        action: 'pick',
        isMerge: false,
    };
}
