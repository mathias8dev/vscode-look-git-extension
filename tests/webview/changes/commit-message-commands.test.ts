import { describe, expect, it } from 'vitest';
import { messageForGenerateCommitMessage, messageForGenerateSubmoduleCommitMessage } from '@webview/features/changes/commit-message-commands';

describe('commit message commands', () => {
    it('creates correlated commit message generation requests', () => {
        const first = messageForGenerateCommitMessage();
        const second = messageForGenerateCommitMessage();

        expect(first).toEqual({
            type: 'changes/generateCommitMessage',
            requestId: expect.stringMatching(/^changes:generate-commit-message:\d+$/),
        });
        expect(second.requestId).not.toBe(first.requestId);
    });

    it('creates correlated submodule commit message generation requests', () => {
        expect(messageForGenerateSubmoduleCommitMessage('modules/auth-kit')).toEqual({
            type: 'changes/generateSubmoduleCommitMessage',
            requestId: expect.stringMatching(/^changes:generate-submodule-commit-message:\d+$/),
            submodulePath: 'modules/auth-kit',
        });
    });
});
