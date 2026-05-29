import { describe, expect, it } from 'vitest';
import { createInitialChangesState, getChangeCount, reduceChangesState, ChangesViewMode, ChangesSortMode, ChangeSelectionMode } from '../../../src/webview/features/changes/changesState';
import { ChangeSectionId } from '../../../src/webview/features/changes/changeTree';
import { ConflictState } from '../../../src/protocol/changes/types';

describe('changesState', () => {
    it('starts in tree loading mode', () => {
        expect(createInitialChangesState()).toEqual(expect.objectContaining({
            viewMode: ChangesViewMode.Tree,
            sortMode: ChangesSortMode.Path,
            pathFilter: '',
            loading: true,
            error: undefined,
        }));
    });

    it('starts with persisted preferences when provided', () => {
        expect(createInitialChangesState({
            viewMode: ChangesViewMode.List,
            sortMode: ChangesSortMode.Status,
            pathFilter: 'src',
            collapsedSectionIds: [ChangeSectionId.Staged],
            commitMessageHistory: ['feat: one'],
        })).toEqual(expect.objectContaining({
            viewMode: ChangesViewMode.List,
            sortMode: ChangesSortMode.Status,
            pathFilter: 'src',
            collapsedSectionIds: [ChangeSectionId.Staged],
            commitMessageHistory: ['feat: one'],
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
                    conflictState: ConflictState.None,
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

    it('remembers commit messages locally', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'rememberCommitMessage',
            message: 'feat: add changes',
        });

        expect(state.commitMessageHistory).toEqual(['feat: add changes']);
    });

    it('switches view modes locally', () => {
        const state = reduceChangesState(createInitialChangesState(), { type: 'setViewMode', viewMode: ChangesViewMode.List });
        expect(state.viewMode).toBe(ChangesViewMode.List);
    });

    it('stores path filter and sort mode locally', () => {
        const filtered = reduceChangesState(createInitialChangesState(), { type: 'setPathFilter', pathFilter: 'src' });
        const sorted = reduceChangesState(filtered, { type: 'setSortMode', sortMode: ChangesSortMode.Status });
        expect(sorted.pathFilter).toBe('src');
        expect(sorted.sortMode).toBe(ChangesSortMode.Status);
    });

    it('toggles collapsed sections locally', () => {
        const collapsed = reduceChangesState(createInitialChangesState(), { type: 'toggleSection', sectionId: ChangeSectionId.Unstaged });
        const expanded = reduceChangesState(collapsed, { type: 'toggleSection', sectionId: ChangeSectionId.Unstaged });
        expect(collapsed.collapsedSectionIds).toEqual([ChangeSectionId.Unstaged]);
        expect(expanded.collapsedSectionIds).toEqual([]);
    });

    it('supports replace, toggle, and range file selection', () => {
        const visibleItemIds = ['a', 'b', 'c', 'd'];
        const selectedA = reduceChangesState(createInitialChangesState(), {
            type: 'selectChange',
            selection: { itemId: 'a', visibleItemIds, mode: ChangeSelectionMode.Replace },
        });
        const selectedAC = reduceChangesState(selectedA, {
            type: 'selectChange',
            selection: { itemId: 'c', visibleItemIds, mode: ChangeSelectionMode.Toggle },
        });
        const selectedRange = reduceChangesState(selectedAC, {
            type: 'selectChange',
            selection: { itemId: 'd', visibleItemIds, mode: ChangeSelectionMode.Range },
        });

        expect(selectedA.selectedItemIds).toEqual(['a']);
        expect(selectedAC.selectedItemIds).toEqual(['a', 'c']);
        expect(selectedRange.selectedItemIds).toEqual(['c', 'd']);
    });

    it('clears selection when requested', () => {
        const selected = reduceChangesState(createInitialChangesState(), {
            type: 'selectChange',
            selection: { itemId: 'a', visibleItemIds: ['a'], mode: ChangeSelectionMode.Replace },
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
