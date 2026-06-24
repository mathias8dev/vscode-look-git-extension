import { describe, expect, it } from 'vitest';
import { CommitMode, ConflictState } from '@protocol/changes/types';
import { ChangeBulkAction, ChangeRowAction } from '@webview/features/changes/change-commands';
import { ChangeSectionId, type ChangeSection } from '@webview/features/changes/change-tree';
import { OperationAction } from '@webview/features/changes/operation-commands';
import {
    messageForSubmoduleAction,
    messageForSubmoduleCommit,
    messageForSubmoduleBulkAction,
    messageForChangesContextTarget,
    messageForSubmoduleOperationAction,
    messageForSubmoduleRowAction,
    messageForSubmoduleStash,
    messageForSubmoduleStashAction,
    messageForSubmoduleStashFileDiff,
    messageForSubmoduleToolbarCommand,
    SubmoduleAction,
    submoduleStashFilesRequestId,
} from '@webview/features/changes/submodule-commands';
import { StashEntryAction } from '@webview/features/changes/stash-commands';

const entry = {
    indexStatus: ' ',
    workTreeStatus: 'M',
    filePath: 'src/inner.ts',
} as const;

const unstagedSection = {
    id: ChangeSectionId.Unstaged,
    title: 'Changes',
    items: [
        {
            id: 'unstaged:src/inner.ts:',
            section: ChangeSectionId.Unstaged,
            entry,
            isStaged: false,
        },
        {
            id: 'unstaged:README.md:',
            section: ChangeSectionId.Unstaged,
            entry: { indexStatus: ' ', workTreeStatus: 'M', filePath: 'README.md' },
            isStaged: false,
        },
        {
            id: 'unstaged:modules/nested:',
            section: ChangeSectionId.Unstaged,
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/nested', isSubmodule: true },
            isStaged: false,
        },
    ],
} satisfies ChangeSection;

describe('submoduleCommands', () => {
    it('maps row actions to submodule-scoped messages', () => {
        expect(messageForSubmoduleRowAction('modules/lib', entry, false, ChangeRowAction.Diff)).toEqual({
            type: 'changes/openSubmoduleDiff',
            submodulePath: 'modules/lib',
            filePath: 'src/inner.ts',
            origPath: undefined,
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'M',
        });
        expect(messageForSubmoduleRowAction('modules/lib', entry, false, ChangeRowAction.Stage)).toEqual({
            type: 'changes/submoduleStageFile',
            submodulePath: 'modules/lib',
            filePath: 'src/inner.ts',
        });
        expect(messageForSubmoduleRowAction('modules/lib', entry, false, ChangeRowAction.Open)).toEqual({
            type: 'changes/submoduleOpenFile',
            submodulePath: 'modules/lib',
            filePath: 'src/inner.ts',
        });
    });

    it('maps bulk actions to submodule-scoped messages', () => {
        expect(messageForSubmoduleBulkAction('modules/lib', unstagedSection, ChangeBulkAction.StageAll)).toEqual({
            type: 'changes/submoduleStageAll',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleBulkAction('modules/lib', unstagedSection, ChangeBulkAction.AcceptAllTheirs)).toEqual({
            type: 'changes/submoduleAcceptAllTheirs',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleBulkAction('modules/lib', unstagedSection, ChangeBulkAction.OpenAllMergeEditors)).toEqual({
            type: 'changes/submoduleOpenAllMergeEditors',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleBulkAction('modules/lib', unstagedSection, ChangeBulkAction.DiscardAll)).toEqual({
            type: 'changes/submoduleDiscardFiles',
            submodulePath: 'modules/lib',
            filePaths: ['src/inner.ts', 'README.md'],
        });
    });

    it('maps operation actions to submodule-scoped messages', () => {
        expect(messageForSubmoduleOperationAction('modules/lib', ConflictState.Merge, OperationAction.OpenFirstMergeEditor)).toEqual({
            type: 'changes/submoduleOpenFirstMergeEditor',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleOperationAction('modules/lib', ConflictState.Merge, OperationAction.OpenAllMergeEditors)).toEqual({
            type: 'changes/submoduleOpenAllMergeEditors',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleOperationAction('modules/lib', ConflictState.Merge, OperationAction.Continue)).toEqual({
            type: 'changes/submoduleContinueOp',
            submodulePath: 'modules/lib',
            conflictState: ConflictState.Merge,
        });
        expect(messageForSubmoduleOperationAction('modules/lib', ConflictState.Rebase, OperationAction.Abort)).toEqual({
            type: 'changes/submoduleAbortOp',
            submodulePath: 'modules/lib',
            conflictState: ConflictState.Rebase,
        });
        expect(messageForSubmoduleOperationAction('modules/lib', ConflictState.Merge, OperationAction.AcceptAllTheirs)).toEqual({
            type: 'changes/submoduleAcceptAllTheirs',
            submodulePath: 'modules/lib',
        });
    });

    it('maps commit messages to submodule-scoped commands', () => {
        expect(messageForSubmoduleCommit('modules/lib', 'feat: inner', CommitMode.Commit)).toEqual({
            type: 'changes/submoduleCommit',
            submodulePath: 'modules/lib',
            message: 'feat: inner',
            mode: CommitMode.Commit,
        });
    });

    it('maps submodule header actions to targeted messages', () => {
        expect(messageForSubmoduleAction('modules/lib', SubmoduleAction.Refresh)).toEqual({
            type: 'changes/getSubmoduleStatus',
            path: 'modules/lib',
            requestId: 'changes:submodule-status:modules/lib',
        });
        expect(messageForSubmoduleAction('modules/lib', SubmoduleAction.Pull)).toEqual({
            type: 'changes/submoduleToolbarCommand',
            submodulePath: 'modules/lib',
            command: 'pull',
        });
        expect(messageForSubmoduleAction('modules/lib', SubmoduleAction.Push)).toEqual({
            type: 'changes/submoduleToolbarCommand',
            submodulePath: 'modules/lib',
            command: 'push',
        });
        expect(messageForChangesContextTarget({ kind: 'submoduleToolbar', submodulePath: 'modules/lib' })).toEqual({
            type: 'changes/contextTarget',
            target: { kind: 'submoduleToolbar', submodulePath: 'modules/lib' },
        });
        expect(messageForChangesContextTarget({ kind: 'commitComposer', submodulePath: 'modules/lib', message: 'feat: inner' })).toEqual({
            type: 'changes/contextTarget',
            target: { kind: 'commitComposer', submodulePath: 'modules/lib', message: 'feat: inner' },
        });
        expect(messageForChangesContextTarget({
            kind: 'selection',
            filePaths: ['src/a.ts'],
            stageFilePaths: ['src/a.ts'],
            unstageFilePaths: [],
            discardFilePaths: ['src/a.ts'],
            stashFilePaths: ['src/a.ts'],
            patchStagedFilePaths: [],
            patchUnstagedFilePaths: ['src/a.ts'],
            patchUntrackedFilePaths: [],
            stashIncludeUntracked: false,
        })).toEqual({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/a.ts'],
                stageFilePaths: ['src/a.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/a.ts'],
                stashFilePaths: ['src/a.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/a.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });
        expect(messageForSubmoduleToolbarCommand('modules/lib', 'fetch')).toEqual({
            type: 'changes/submoduleToolbarCommand',
            submodulePath: 'modules/lib',
            command: 'fetch',
        });
    });

    it('maps stash actions and file diffs to submodule-scoped messages', () => {
        expect(messageForSubmoduleStash('modules/lib', '  save inner  ')).toEqual({
            type: 'changes/submoduleStash',
            submodulePath: 'modules/lib',
            message: 'save inner',
        });
        expect(messageForSubmoduleStashAction('modules/lib', 1, StashEntryAction.LoadFiles)).toEqual({
            type: 'changes/getSubmoduleStashFiles',
            submodulePath: 'modules/lib',
            index: 1,
            requestId: 'changes:submodule-stash-files:modules/lib:1',
        });
        expect(messageForSubmoduleStashFileDiff('modules/lib', 1, {
            status: 'M',
            filePath: 'src/inner.ts',
        })).toEqual({
            type: 'changes/openSubmoduleStashDiff',
            submodulePath: 'modules/lib',
            index: 1,
            status: 'M',
            filePath: 'src/inner.ts',
            origPath: undefined,
        });
        expect(submoduleStashFilesRequestId('modules/lib', 2)).toBe('changes:submodule-stash-files:modules/lib:2');
    });
});
