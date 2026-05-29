import { describe, expect, it } from 'vitest';
import { canSubmitCommit, commitBlockReason } from '../../../src/webview/features/changes/commitComposerModel';

describe('commitComposerModel', () => {
    it('blocks empty messages', () => {
        expect(canSubmitCommit({ message: '   ', mode: 'commit', stagedCount: 1, conflictState: 'none' })).toBe(false);
        expect(commitBlockReason({ message: '   ', mode: 'commit', stagedCount: 1, conflictState: 'none' })).toBe('Commit message required.');
    });

    it('blocks regular commits without staged files', () => {
        expect(canSubmitCommit({ message: 'feat: add', mode: 'commit', stagedCount: 0, conflictState: 'none' })).toBe(false);
        expect(commitBlockReason({ message: 'feat: add', mode: 'commitPush', stagedCount: 0, conflictState: 'none' })).toBe('Stage files before committing.');
    });

    it('allows amend with only a message', () => {
        expect(canSubmitCommit({ message: 'feat: amend', mode: 'amend', stagedCount: 0, conflictState: 'none' })).toBe(true);
    });

    it('blocks commits during merge or rebase conflicts', () => {
        expect(commitBlockReason({ message: 'feat: add', mode: 'commit', stagedCount: 1, conflictState: 'merge' })).toBe('Resolve conflicts before committing.');
        expect(commitBlockReason({ message: 'feat: add', mode: 'commit', stagedCount: 1, conflictState: 'rebase' })).toBe('Resolve conflicts before committing.');
    });
});
