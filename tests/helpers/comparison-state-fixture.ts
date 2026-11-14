import { ComparisonMode, type ComparisonSnapshot } from '@protocol/comparison/types';
import { initialComparisonState, type ComparisonState } from '@webview/features/comparison/comparison-state';

export const comparisonSnapshot: ComparisonSnapshot = {
    id: 'snapshot', baseBranch: 'main', headBranch: 'feature/sessions', mode: ComparisonMode.SinceDivergence, baseHash: 'a'.repeat(40), headHash: 'b'.repeat(40), leftHash: 'c'.repeat(40),
    files: { items: [
        { status: 'M', filePath: 'src/login.ts', additions: 3, deletions: 1 },
        { status: 'A', filePath: 'src/session.ts', additions: 5, deletions: 0 },
        { status: 'M', filePath: 'modules/shared', isSubmodule: true, oldRevision: '1'.repeat(40), newRevision: '2'.repeat(40), additions: 1, deletions: 1 },
    ], totalCount: 3, matchingCount: 3, hasMore: false, additions: 8, deletions: 1 },
    commits: { items: [
        { hash: 'b'.repeat(40), shortHash: 'bbbbbbb', message: 'Add sessions', authorName: 'Mathias', authorDate: '2026-11-14T09:00:00Z' },
        { hash: 'd'.repeat(40), shortHash: 'ddddddd', message: 'Prepare session contracts', authorName: 'Mathias', authorDate: '2026-11-13T09:00:00Z' },
    ], hasMore: false, totalCount: 2 },
};

export function comparisonStateFixture(): ComparisonState {
    return { ...initialComparisonState, repositoryLabel: 'look-git', snapshot: comparisonSnapshot, settings: { baseBranch: comparisonSnapshot.baseBranch, headBranch: comparisonSnapshot.headBranch, mode: comparisonSnapshot.mode }, files: comparisonSnapshot.files, commits: comparisonSnapshot.commits, selectedFile: 'src/login.ts', selectedCommit: 'b'.repeat(40) };
}
