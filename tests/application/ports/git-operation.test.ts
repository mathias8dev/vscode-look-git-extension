import { describe, expect, it } from 'vitest';
import { SEMANTIC_GIT_OPERATIONS, isSemanticGitOperation } from '@application/ports/git-operation';

describe('semantic git operations', () => {
    it('does not contain duplicate operation names', () => {
        expect(new Set(SEMANTIC_GIT_OPERATIONS).size).toBe(SEMANTIC_GIT_OPERATIONS.length);
    });

    it('covers the major repository and worktree operation families', () => {
        expect(SEMANTIC_GIT_OPERATIONS).toEqual(expect.arrayContaining([
            'getCommitGraph',
            'getFileSelectionHistory',
            'getBlame',
            'compareBranches',
            'listWorktrees',
            'listSubmodules',
            'getStatus',
            'stageHunks',
            'applyPatch',
            'rebase',
            'startInteractiveRebase',
            'resetHard',
            'undoLastCommit',
            'dropCommit',
            'forcePushWithLease',
        ]));
    });

    it('narrows strings to semantic operation names', () => {
        expect(isSemanticGitOperation('rebase')).toBe(true);
        expect(isSemanticGitOperation('git rebase main')).toBe(false);
    });
});
