import { describe, expect, it } from 'vitest';
import {
    buildCommitMessage,
    canSubmitCommit,
    commitBlockReason,
    messageStats,
    rememberCommitMessage,
} from '../../../src/webview/features/changes/commitComposerModel';
import { CommitMode, ConflictState } from '../../../src/protocol/changes/types';

describe('commitComposerModel', () => {
    it('blocks empty messages', () => {
        expect(canSubmitCommit({ message: '   ', mode: CommitMode.Commit, stagedCount: 1, conflictState: ConflictState.None })).toBe(false);
        expect(commitBlockReason({ message: '   ', mode: CommitMode.Commit, stagedCount: 1, conflictState: ConflictState.None })).toBe('Commit message required.');
    });

    it('blocks regular commits without staged files', () => {
        expect(canSubmitCommit({ message: 'feat: add', mode: CommitMode.Commit, stagedCount: 0, conflictState: ConflictState.None })).toBe(false);
        expect(commitBlockReason({ message: 'feat: add', mode: CommitMode.CommitPush, stagedCount: 0, conflictState: ConflictState.None })).toBe('Stage files before committing.');
    });

    it('allows amend with only a message', () => {
        expect(canSubmitCommit({ message: 'feat: amend', mode: CommitMode.Amend, stagedCount: 0, conflictState: ConflictState.None })).toBe(true);
    });

    it('blocks commits during merge or rebase conflicts', () => {
        expect(commitBlockReason({ message: 'feat: add', mode: CommitMode.Commit, stagedCount: 1, conflictState: ConflictState.Merge })).toBe('Resolve conflicts before committing.');
        expect(commitBlockReason({ message: 'feat: add', mode: CommitMode.Commit, stagedCount: 1, conflictState: ConflictState.Rebase })).toBe('Resolve conflicts before committing.');
    });

    it('builds optional conventional commit messages', () => {
        expect(buildCommitMessage({ type: '', scope: '', message: 'add thing' })).toBe('add thing');
        expect(buildCommitMessage({ type: 'feat', scope: '', message: 'add thing' })).toBe('feat: add thing');
        expect(buildCommitMessage({ type: 'fix', scope: 'ui', message: 'patch thing\n\nbody' })).toBe('fix(ui): patch thing\n\nbody');
    });

    it('counts message lines and characters', () => {
        expect(messageStats('')).toEqual({ lines: 0, characters: 0 });
        expect(messageStats('one\ntwo')).toEqual({ lines: 2, characters: 7 });
    });

    it('keeps recent commit messages unique and capped', () => {
        expect(rememberCommitMessage(['fix: b', 'feat: a'], 'feat: a')).toEqual(['feat: a', 'fix: b']);
        expect(rememberCommitMessage(['b', 'c'], 'a', 2)).toEqual(['a', 'b']);
    });
});
