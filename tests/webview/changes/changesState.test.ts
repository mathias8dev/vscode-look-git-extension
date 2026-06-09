import { describe, expect, it } from 'vitest';
import { createInitialChangesState, getChangeCount, reduceChangesState, ChangesViewMode, ChangesSortMode, ChangeSelectionMode, submoduleStashKey } from '../../../src/webview/features/changes/changesState';
import { ChangeSectionId } from '../../../src/webview/features/changes/changeTree';
import { ConflictState } from '../../../src/protocol/changes/types';
import { OperationStatus } from '../../../src/protocol/shared/operation';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';

describe('changesState', () => {
    it('starts in list loading mode', () => {
        expect(createInitialChangesState()).toEqual(expect.objectContaining({
            viewMode: ChangesViewMode.List,
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
                    submodules: [],
                },
            },
        });

        expect(state.loading).toBe(false);
        expect(getChangeCount(state.status)).toBe(2);
        expect(state.stashFilesByIndex).toEqual({});
        expect(state.expandedStashIndexes).toEqual([]);
    });

    it('keeps expanded stashes across matching status refreshes', () => {
        const initialStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                stashes: [
                    { index: 0, message: 'On main: work' },
                    { index: 1, message: 'On main: old work' },
                ],
            }),
        });
        const expandedFirst = reduceChangesState(initialStatus, { type: 'toggleStash', index: 0 });
        const expandedSecond = reduceChangesState(expandedFirst, { type: 'toggleStash', index: 1 });
        const withFiles = reduceChangesState(expandedSecond, {
            type: 'message',
            message: {
                type: 'changes/stashFiles',
                requestId: 'stash-0',
                index: 0,
                files: [{ status: 'M', filePath: 'src/app.ts' }],
            },
        });

        const refreshed = reduceChangesState(withFiles, {
            type: 'message',
            message: statusDataMessage({
                stashes: [{ index: 0, message: 'On main: work' }],
            }),
        });

        expect(refreshed.expandedStashIndexes).toEqual([0]);
        expect(refreshed.stashFilesByIndex[0]).toEqual([{ status: 'M', filePath: 'src/app.ts' }]);
    });

    it('drops expanded stashes when their index now refers to another stash', () => {
        const initialStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                stashes: [{ index: 0, message: 'On main: work' }],
            }),
        });
        const expanded = reduceChangesState(initialStatus, { type: 'toggleStash', index: 0 });
        const withFiles = reduceChangesState(expanded, {
            type: 'message',
            message: {
                type: 'changes/stashFiles',
                requestId: 'stash-0',
                index: 0,
                files: [{ status: 'M', filePath: 'src/app.ts' }],
            },
        });

        const refreshed = reduceChangesState(withFiles, {
            type: 'message',
            message: statusDataMessage({
                stashes: [{ index: 0, message: 'On main: different work' }],
            }),
        });

        expect(refreshed.expandedStashIndexes).toEqual([]);
        expect(refreshed.stashFilesByIndex).toEqual({});
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

    it('keeps protocol errors visible across status refreshes', () => {
        const failed = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/error',
                message: 'Stash pop failed',
                error: { code: 'gitOperationFailed', message: 'Stash pop failed', recoverable: true },
            },
        });
        const refreshed = reduceChangesState(failed, {
            type: 'message',
            message: statusDataMessage(),
        });

        expect(refreshed.loading).toBe(false);
        expect(refreshed.error?.message).toBe('Stash pop failed');
    });

    it('stores commit feedback from commit result messages', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: { type: 'changes/commitResult', success: true },
        });

        expect(state.commitFeedback).toEqual({ success: true, message: undefined });
    });

    it('clears commit feedback locally', () => {
        const withFeedback = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: { type: 'changes/commitResult', success: true },
        });
        const cleared = reduceChangesState(withFeedback, { type: 'clearCommitFeedback' });

        expect(cleared.commitFeedback).toBeUndefined();
    });

    it('clears submodule commit feedback locally', () => {
        const withFeedback = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/submoduleCommitResult',
                path: 'modules/lib',
                success: true,
            },
        });
        const cleared = reduceChangesState(withFeedback, {
            type: 'clearSubmoduleCommitFeedback',
            path: 'modules/lib',
        });

        expect(cleared.submoduleCommitFeedbackByPath).toEqual({});
    });

    it('tracks generated commit message requests and responses', () => {
        const requested = reduceChangesState(createInitialChangesState(), {
            type: 'requestCommitMessageGeneration',
            requestId: 'generate-1',
        });
        const ignored = reduceChangesState(requested, {
            type: 'message',
            message: {
                type: 'changes/generatedCommitMessage',
                requestId: 'old-generate',
                message: 'fix: ignore stale suggestion',
            },
        });
        const received = reduceChangesState(ignored, {
            type: 'message',
            message: {
                type: 'changes/generatedCommitMessage',
                requestId: 'generate-1',
                message: 'feat(changes): generate commit messages',
            },
        });

        expect(requested.commitMessageGenerationRequestId).toBe('generate-1');
        expect(ignored.generatedCommitMessage).toBeUndefined();
        expect(received.commitMessageGenerationRequestId).toBeUndefined();
        expect(received.generatedCommitMessage).toEqual({
            requestId: 'generate-1',
            message: 'feat(changes): generate commit messages',
        });
    });

    it('keeps language model generation errors near the commit composer', () => {
        const requested = reduceChangesState(createInitialChangesState(), {
            type: 'requestCommitMessageGeneration',
            requestId: 'generate-1',
        });
        const failed = reduceChangesState(requested, {
            type: 'message',
            message: {
                type: 'changes/error',
                requestId: 'generate-1',
                message: 'No language model available',
                error: {
                    code: 'languageModelFailed',
                    message: 'No language model available',
                    recoverable: true,
                },
            },
        });

        expect(failed.commitMessageGenerationRequestId).toBeUndefined();
        expect(failed.commitMessageGenerationError).toEqual(expect.objectContaining({
            message: 'No language model available',
        }));
    });

    it('tracks generated commit message requests per submodule', () => {
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
            }),
        });
        const requested = reduceChangesState(withStatus, {
            type: 'requestSubmoduleCommitMessageGeneration',
            path: 'modules/lib',
            requestId: 'sub-generate-1',
        });
        const received = reduceChangesState(requested, {
            type: 'message',
            message: {
                type: 'changes/submoduleGeneratedCommitMessage',
                requestId: 'sub-generate-1',
                path: 'modules/lib',
                message: 'fix(lib): update module',
            },
        });

        expect(requested.submoduleCommitMessageGenerationRequestIdByPath).toEqual({
            'modules/lib': 'sub-generate-1',
        });
        expect(received.submoduleCommitMessageGenerationRequestIdByPath).toEqual({});
        expect(received.generatedSubmoduleCommitMessageByPath['modules/lib']).toEqual({
            requestId: 'sub-generate-1',
            message: 'fix(lib): update module',
        });
    });

    it('stores language model errors per submodule and prunes removed submodule suggestions', () => {
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
            }),
        });
        const requested = reduceChangesState(withStatus, {
            type: 'requestSubmoduleCommitMessageGeneration',
            path: 'modules/lib',
            requestId: 'sub-generate-1',
        });
        const failed = reduceChangesState(requested, {
            type: 'message',
            message: {
                type: 'changes/error',
                requestId: 'sub-generate-1',
                message: 'No language model available',
                error: {
                    code: 'languageModelFailed',
                    message: 'No language model available',
                    recoverable: true,
                },
            },
        });
        const removed = reduceChangesState(failed, {
            type: 'message',
            message: statusDataMessage({ submodules: [] }),
        });

        expect(failed.submoduleCommitMessageGenerationRequestIdByPath).toEqual({});
        expect(failed.submoduleCommitMessageGenerationErrorByPath['modules/lib']).toEqual(expect.objectContaining({
            message: 'No language model available',
        }));
        expect(removed.submoduleCommitMessageGenerationErrorByPath).toEqual({});
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

    it('applies extension sort mode from extension messages', () => {
        const state = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: { type: 'changes/applySortMode', sortMode: 'extension' },
        });

        expect(state.sortMode).toBe(ChangesSortMode.Extension);
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
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                stashes: [{ index: 0, message: 'On main: work' }],
            }),
        });
        const state = reduceChangesState(withStatus, {
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

    it('keeps expanded submodules mounted across parent status refreshes and marks details stale', () => {
        const initialStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/statusData',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [],
                    submodules: [
                        { path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty },
                        { path: 'modules/old', name: 'old', status: SubmoduleStatus.Dirty },
                    ],
                },
            },
        });
        const expandedLib = reduceChangesState(initialStatus, { type: 'toggleSubmodule', path: 'modules/lib' });
        const expandedOld = reduceChangesState(expandedLib, { type: 'toggleSubmodule', path: 'modules/old' });
        const withDetails = reduceChangesState(expandedOld, {
            type: 'message',
            message: {
                type: 'changes/submoduleStatusData',
                requestId: 'sub-1',
                path: 'modules/lib',
                data: {
                    staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'src/new.ts' }],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [{ index: 0, message: 'On main: work' }],
                },
            },
        });
        const withExpandedStash = reduceChangesState(withDetails, {
            type: 'toggleSubmoduleStash',
            key: submoduleStashKey('modules/lib', 0),
        });
        const withStashFiles = reduceChangesState(withExpandedStash, {
            type: 'message',
            message: {
                type: 'changes/submoduleStashFiles',
                requestId: 'stash-1',
                path: 'modules/lib',
                index: 0,
                files: [{ status: 'M', filePath: 'src/stashed.ts' }],
            },
        });

        const refreshed = reduceChangesState(withStashFiles, {
            type: 'message',
            message: {
                type: 'changes/statusData',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [],
                    submodules: [
                        { path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty },
                    ],
                },
            },
        });

        expect(refreshed.expandedSubmodulePaths).toEqual(['modules/lib']);
        expect(refreshed.submoduleStatusByPath['modules/lib']).toEqual(withDetails.submoduleStatusByPath['modules/lib']);
        expect(refreshed.staleSubmoduleStatusPaths).toEqual(['modules/lib']);
        expect(refreshed.expandedSubmoduleStashKeys).toEqual([submoduleStashKey('modules/lib', 0)]);
        expect(refreshed.submoduleStashFilesByKey[submoduleStashKey('modules/lib', 0)]).toEqual([{ status: 'M', filePath: 'src/stashed.ts' }]);
    });

    it('clears stale submodule status after fresh details arrive and prunes changed stashes', () => {
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
            }),
        });
        const expanded = reduceChangesState(withStatus, { type: 'toggleSubmodule', path: 'modules/lib' });
        const withDetails = reduceChangesState(expanded, {
            type: 'message',
            message: {
                type: 'changes/submoduleStatusData',
                requestId: 'sub-1',
                path: 'modules/lib',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [{ index: 0, message: 'On main: work' }],
                },
            },
        });
        const withExpandedStash = reduceChangesState(withDetails, {
            type: 'toggleSubmoduleStash',
            key: submoduleStashKey('modules/lib', 0),
        });
        const withStashFiles = reduceChangesState(withExpandedStash, {
            type: 'message',
            message: {
                type: 'changes/submoduleStashFiles',
                requestId: 'stash-1',
                path: 'modules/lib',
                index: 0,
                files: [{ status: 'M', filePath: 'src/stashed.ts' }],
            },
        });
        const parentRefresh = reduceChangesState(withStashFiles, {
            type: 'message',
            message: statusDataMessage({
                submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
            }),
        });

        const freshDetails = reduceChangesState(parentRefresh, {
            type: 'message',
            message: {
                type: 'changes/submoduleStatusData',
                requestId: 'sub-2',
                path: 'modules/lib',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [{ index: 0, message: 'On main: different work' }],
                },
            },
        });

        expect(freshDetails.staleSubmoduleStatusPaths).toEqual([]);
        expect(freshDetails.expandedSubmoduleStashKeys).toEqual([]);
        expect(freshDetails.submoduleStashFilesByKey).toEqual({});
    });

    it('tracks pending submodule status requests and clears them on response or error', () => {
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
            }),
        });
        const loading = reduceChangesState(withStatus, { type: 'requestSubmoduleStatus', path: 'modules/lib' });
        const freshDetails = reduceChangesState(loading, {
            type: 'message',
            message: {
                type: 'changes/submoduleStatusData',
                requestId: 'changes:submodule-status:modules/lib',
                path: 'modules/lib',
                data: { staged: [], unstaged: [], conflicts: [], conflictState: ConflictState.None, stashes: [] },
            },
        });
        const loadingAgain = reduceChangesState(freshDetails, { type: 'requestSubmoduleStatus', path: 'modules/lib' });
        const failed = reduceChangesState(loadingAgain, {
            type: 'message',
            message: {
                type: 'changes/error',
                requestId: 'changes:submodule-status:modules/lib',
                message: 'status failed',
                error: { code: 'gitOperationFailed', message: 'status failed', recoverable: true },
            },
        });

        expect(loading.loadingSubmoduleStatusPaths).toEqual(['modules/lib']);
        expect(freshDetails.loadingSubmoduleStatusPaths).toEqual([]);
        expect(loadingAgain.loadingSubmoduleStatusPaths).toEqual(['modules/lib']);
        expect(failed.loadingSubmoduleStatusPaths).toEqual([]);
    });

    it('ignores late submodule detail responses for unknown submodules and stale stashes', () => {
        const withStatus = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: {
                type: 'changes/statusData',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: ConflictState.None,
                    stashes: [],
                    submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
                },
            },
        });
        const unknownStatus = reduceChangesState(withStatus, {
            type: 'message',
            message: {
                type: 'changes/submoduleStatusData',
                requestId: 'sub-old',
                path: 'modules/removed',
                data: { staged: [], unstaged: [], conflicts: [], conflictState: ConflictState.None, stashes: [] },
            },
        });
        const staleFiles = reduceChangesState(unknownStatus, {
            type: 'message',
            message: {
                type: 'changes/submoduleStashFiles',
                requestId: 'stash-old',
                path: 'modules/lib',
                index: 0,
                files: [{ status: 'M', filePath: 'old.ts' }],
            },
        });

        expect(unknownStatus.submoduleStatusByPath).toEqual({});
        expect(staleFiles.submoduleStashFilesByKey).toEqual({});
    });

    it('tracks operation status and ignores stale completed operations', () => {
        const running = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: { type: 'changes/operationStatus', operationId: 'op-1', status: OperationStatus.Running, command: 'pull' },
        });
        const staleSuccess = reduceChangesState(running, {
            type: 'message',
            message: { type: 'changes/operationStatus', operationId: 'op-0', status: OperationStatus.Success, command: 'fetch' },
        });
        const success = reduceChangesState(running, {
            type: 'message',
            message: { type: 'changes/operationStatus', operationId: 'op-1', status: OperationStatus.Success, command: 'pull' },
        });
        const cleared = reduceChangesState(success, { type: 'clearOperationStatus', operationId: 'op-1' });

        expect(running.operationStatus?.status).toBe(OperationStatus.Running);
        expect(staleSuccess.operationStatus?.operationId).toBe('op-1');
        expect(success.operationStatus?.status).toBe(OperationStatus.Success);
        expect(cleared.operationStatus).toBeUndefined();
    });

    it('clears conflicts-only mode after conflicts disappear', () => {
        const withConflicts = reduceChangesState(createInitialChangesState(), {
            type: 'message',
            message: statusDataMessage({
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.txt' }],
                conflictState: ConflictState.Merge,
            }),
        });
        const conflictsOnly = reduceChangesState(withConflicts, { type: 'setShowConflictsOnly', showConflictsOnly: true });
        const resolved = reduceChangesState(conflictsOnly, {
            type: 'message',
            message: statusDataMessage({ conflicts: [], conflictState: ConflictState.Merge }),
        });

        expect(conflictsOnly.showConflictsOnly).toBe(true);
        expect(resolved.showConflictsOnly).toBe(false);
    });
});

function statusDataMessage(overrides: Partial<Parameters<typeof createStatusData>[0]> = {}) {
    return {
        type: 'changes/statusData' as const,
        data: createStatusData(overrides),
    };
}

function createStatusData(overrides: {
    readonly stashes?: readonly { readonly index: number; readonly message: string }[];
    readonly submodules?: readonly { readonly path: string; readonly name: string; readonly status: SubmoduleStatus }[];
    readonly conflicts?: readonly { readonly indexStatus: string; readonly workTreeStatus: string; readonly filePath: string }[];
    readonly conflictState?: ConflictState;
} = {}) {
    return {
        staged: [],
        unstaged: [],
        conflicts: overrides.conflicts ?? [],
        conflictState: overrides.conflictState ?? ConflictState.None,
        stashes: overrides.stashes ?? [],
        submodules: overrides.submodules ?? [],
    };
}
