import { describe, expect, it } from 'vitest';
import { isNonFastForwardPushError } from '@extension/git/git-error';

describe('git error classification', () => {
    it('recognizes non-fast-forward push failures', () => {
        expect(isNonFastForwardPushError({ stderr: '! [rejected] feature -> feature (non-fast-forward)' })).toBe(true);
        expect(isNonFastForwardPushError({ stderr: '! [rejected] feature -> feature (fetch first)' })).toBe(true);
        expect(isNonFastForwardPushError(new Error('Updates were rejected because the remote contains work that you do not have locally.'))).toBe(true);
    });

    it('does not classify unrelated push failures as non-fast-forward', () => {
        expect(isNonFastForwardPushError({ stderr: '! [remote rejected] main -> main (protected branch hook declined)' })).toBe(false);
        expect(isNonFastForwardPushError(new Error('Could not read from remote repository.'))).toBe(false);
    });
});
