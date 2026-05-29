import { describe, expect, it } from 'vitest';
import { createInitialChangesState, getChangeCount, reduceChangesState } from '../../../src/webview/features/changes/changesState';

describe('changesState', () => {
    it('starts in tree loading mode', () => {
        expect(createInitialChangesState()).toEqual(expect.objectContaining({
            viewMode: 'tree',
            sortMode: 'path',
            pathFilter: '',
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

    it('stores path filter and sort mode locally', () => {
        const filtered = reduceChangesState(createInitialChangesState(), { type: 'setPathFilter', pathFilter: 'src' });
        const sorted = reduceChangesState(filtered, { type: 'setSortMode', sortMode: 'status' });
        expect(sorted.pathFilter).toBe('src');
        expect(sorted.sortMode).toBe('status');
    });

    it('toggles collapsed sections locally', () => {
        const collapsed = reduceChangesState(createInitialChangesState(), { type: 'toggleSection', sectionId: 'unstaged' });
        const expanded = reduceChangesState(collapsed, { type: 'toggleSection', sectionId: 'unstaged' });
        expect(collapsed.collapsedSectionIds).toEqual(['unstaged']);
        expect(expanded.collapsedSectionIds).toEqual([]);
    });

    it('supports replace, toggle, and range file selection', () => {
        const visibleItemIds = ['a', 'b', 'c', 'd'];
        const selectedA = reduceChangesState(createInitialChangesState(), {
            type: 'selectChange',
            selection: { itemId: 'a', visibleItemIds, mode: 'replace' },
        });
        const selectedAC = reduceChangesState(selectedA, {
            type: 'selectChange',
            selection: { itemId: 'c', visibleItemIds, mode: 'toggle' },
        });
        const selectedRange = reduceChangesState(selectedAC, {
            type: 'selectChange',
            selection: { itemId: 'd', visibleItemIds, mode: 'range' },
        });

        expect(selectedA.selectedItemIds).toEqual(['a']);
        expect(selectedAC.selectedItemIds).toEqual(['a', 'c']);
        expect(selectedRange.selectedItemIds).toEqual(['c', 'd']);
    });

    it('clears selection when requested', () => {
        const selected = reduceChangesState(createInitialChangesState(), {
            type: 'selectChange',
            selection: { itemId: 'a', visibleItemIds: ['a'], mode: 'replace' },
        });
        const cleared = reduceChangesState(selected, { type: 'clearSelection' });
        expect(cleared.selectedItemIds).toEqual([]);
        expect(cleared.selectionAnchorId).toBeUndefined();
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
