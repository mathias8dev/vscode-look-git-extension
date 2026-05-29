import { describe, expect, it } from 'vitest';
import { createInitialChangesState, getChangeCount, reduceChangesState } from '../../../src/webview/features/changes/changesState';

describe('changesState', () => {
    it('starts in tree loading mode', () => {
        expect(createInitialChangesState()).toEqual(expect.objectContaining({
            viewMode: 'tree',
            loading: true,
            error: undefined,
        }));
    });

    it('stores status data from extension messages', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/app.ts' }],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'README.md' }],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [],
                },
            },
        });

        expect(state.loading).toBe(false);
        expect(getChangeCount(state.status)).toBe(2);
    });

    it('stores protocol errors from extension messages', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/error',
                message: 'Failed',
                error: { code: 'refreshFailed', message: 'Failed', recoverable: true },
            },
        });

        expect(state.loading).toBe(false);
        expect(state.error).toEqual(expect.objectContaining({ code: 'refreshFailed' }));
    });

    it('switches view modes locally', () => {
        const state = reduceChangesState(createInitialChangesState(), { type: 'setViewMode', viewMode: 'list' });
        expect(state.viewMode).toBe('list');
    });
});
