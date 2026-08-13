import { describe, expect, it } from 'vitest';
import { initialVisualRebaseState, reduceVisualRebaseState } from '@webview/features/visual-rebase/visual-rebase-state';

describe('reduceVisualRebaseState', () => {
    it('models a conflict pause separately from an operation failure', () => {
        const state = reduceVisualRebaseState(initialVisualRebaseState, {
            type: 'message',
            message: {
                type: 'visualRebase/paused',
                reason: 'conflicts',
                message: 'Rebase paused with conflicts.',
                conflictFiles: [conflictFile],
            },
        });

        expect(state.phase).toBe('conflicts');
        expect(state.notice?.message).toBe('Rebase paused with conflicts.');
        expect(state.conflictFiles).toEqual([conflictFile]);
    });

    it('keeps the conflict surface mounted while resolving a file', () => {
        const conflictState = {
            ...initialVisualRebaseState,
            phase: 'conflicts' as const,
            conflictFiles: [conflictFile],
        };

        const state = reduceVisualRebaseState(conflictState, {
            type: 'message',
            message: { type: 'visualRebase/started', operation: 'resolveConflict' },
        });

        expect(state.phase).toBe('conflicts');
        expect(state.running).toBe(true);
        expect(state.conflictFiles).toEqual([conflictFile]);
    });

    it('moves continue operations to an indeterminate running state', () => {
        const state = reduceVisualRebaseState({
            ...initialVisualRebaseState,
            phase: 'paused',
        }, {
            type: 'message',
            message: { type: 'visualRebase/started', operation: 'continue' },
        });

        expect(state.phase).toBe('running');
        expect(state.operation).toBe('continue');
        expect(state.running).toBe(true);
    });

    it('distinguishes failed and aborted outcomes', () => {
        const failed = reduceVisualRebaseState(initialVisualRebaseState, {
            type: 'message',
            message: { type: 'visualRebase/error', message: 'Command failed.' },
        });
        const aborted = reduceVisualRebaseState(failed, {
            type: 'message',
            message: { type: 'visualRebase/aborted' },
        });

        expect(failed.phase).toBe('failed');
        expect(failed.notice?.message).toBe('Command failed.');
        expect(aborted.phase).toBe('aborted');
        expect(aborted.notice).toBeUndefined();
    });

    it('keeps only the latest requested commit details', () => {
        const firstRequest = reduceVisualRebaseState(initialVisualRebaseState, {
            type: 'commitDetailsStarted',
            requestId: 'details-1',
            hash: 'aaa111',
        });
        const secondRequest = reduceVisualRebaseState(firstRequest, {
            type: 'commitDetailsStarted',
            requestId: 'details-2',
            hash: 'bbb222',
        });
        const staleResponse = reduceVisualRebaseState(secondRequest, {
            type: 'message',
            message: {
                type: 'visualRebase/commitDetailsResponse',
                requestId: 'details-1',
                hash: 'aaa111',
                files: [{ status: 'M', filePath: 'src/old.ts' }],
            },
        });
        const currentResponse = reduceVisualRebaseState(staleResponse, {
            type: 'message',
            message: {
                type: 'visualRebase/commitDetailsResponse',
                requestId: 'details-2',
                hash: 'bbb222',
                files: [{ status: 'A', filePath: 'src/new.ts' }],
            },
        });

        expect(staleResponse).toBe(secondRequest);
        expect(currentResponse.commitDetails).toEqual({
            hash: 'bbb222',
            files: [{ status: 'A', filePath: 'src/new.ts' }],
        });
        expect(currentResponse.commitDetailsLoading).toBe(false);
    });
});

const conflictFile = {
    filePath: 'src/app.ts',
    indexStatus: 'U',
    workTreeStatus: 'U',
    state: 'unmerged' as const,
};
