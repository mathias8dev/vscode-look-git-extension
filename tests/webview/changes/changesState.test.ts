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
        expect(state.stashFilesByIndex).toEqual({});
        expect(state.expandedStashIndexes).toEqual([]);
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

    it('stores commit feedback from commit result messages', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: { type: 'changes/commitResult', success: true },
        });

        expect(state.commitFeedback).toEqual({ success: true, message: undefined });
    });

    it('switches view modes locally', () => {
        const state = reduceChangesState(createInitialChangesState(), { type: 'setViewMode', viewMode: 'list' });
        expect(state.viewMode).toBe('list');
    });

    it('toggles expanded stashes locally', () => {
        const expanded = reduceChangesState(createInitialChangesState(), { type: 'toggleStash', index: 1 });
        const collapsed = reduceChangesState(expanded, { type: 'toggleStash', index: 1 });

        expect(expanded.expandedStashIndexes).toEqual([1]);
        expect(collapsed.expandedStashIndexes).toEqual([]);
    });

    it('stores stash files by stash index', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/stashFiles',
                requestId: 'changes:stash-files:0',
                index: 0,
                files: [{ status: 'M', filePath: 'src/app.ts' }],
            },
        });

        expect(state.loading).toBe(false);
        expect(state.stashFilesByIndex[0]).toEqual([{ status: 'M', filePath: 'src/app.ts' }]);
    });
});
