import type { VisualRebaseCommit } from '@protocol/visual-rebase/types';

export type VisualRebaseDropEdge = 'before' | 'after';

export function reorderVisualRebaseCommits(
    commits: readonly VisualRebaseCommit[],
    sourceHash: string,
    targetHash: string,
    edge: VisualRebaseDropEdge,
): readonly VisualRebaseCommit[] {
    const sourceIndex = commits.findIndex((commit) => commit.hash === sourceHash);
    const targetIndex = commits.findIndex((commit) => commit.hash === targetHash);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) { return commits; }

    const reordered = [...commits];
    const [source] = reordered.splice(sourceIndex, 1);
    if (!source) { return commits; }

    const adjustedTargetIndex = reordered.findIndex((commit) => commit.hash === targetHash);
    const insertionIndex = adjustedTargetIndex + (edge === 'after' ? 1 : 0);
    reordered.splice(insertionIndex, 0, source);

    return reordered.every((commit, index) => commit.hash === commits[index]?.hash)
        ? commits
        : reordered;
}
