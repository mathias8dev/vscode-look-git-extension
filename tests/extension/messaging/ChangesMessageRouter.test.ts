import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangesMessageRouter } from '../../../src/extension/messaging/ChangesMessageRouter';
import type { ChangesExtensionToWebviewMessage } from '../../../src/protocol/changes/messages';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { resetMockVscode } from '../../mocks/vscode';

describe('ChangesMessageRouter', () => {
    beforeEach(resetMockVscode);

    it('reports a clear stash pop error when local changes would be overwritten', async () => {
        const gitError = Object.assign(new Error('git stash pop failed'), {
            stderr: [
                'error: Your local changes to the following files would be overwritten by merge:',
                '\tsrc/app.ts',
                'Please commit your changes or stash them before you merge.',
            ].join('\n'),
        });
        const repo = makeRepositoryMock({
            stashPop: vi.fn(async () => { throw gitError; }),
        });
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const refresh = vi.fn(async () => {});
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            (message) => { messages.push(message); },
            refresh,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'popLatestStash' });

        const error = messages.find((message) => message.type === 'changes/error');
        expect(error?.message).toBe('Stash pop could not be applied because local changes would be overwritten. Commit, stash, or discard your local changes, then try again.');
        expect(error?.error.details).toContain('src/app.ts');
        expect(refresh).toHaveBeenCalled();
    });
});
