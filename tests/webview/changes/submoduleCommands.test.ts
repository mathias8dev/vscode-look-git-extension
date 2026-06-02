import { describe, expect, it } from 'vitest';
import { CommitMode, ConflictState } from '../../../src/protocol/changes/types';
import { ChangeBulkAction, ChangeRowAction } from '../../../src/webview/features/changes/changeCommands';
import { OperationAction } from '../../../src/webview/features/changes/operationCommands';
import {
    messageForSubmoduleCommit,
    messageForSubmoduleBulkAction,
    messageForSubmoduleOperationAction,
    messageForSubmoduleRowAction,
    messageForSubmoduleStash,
    messageForSubmoduleStashAction,
    messageForSubmoduleStashFileDiff,
    submoduleStashFilesRequestId,
} from '../../../src/webview/features/changes/submoduleCommands';
import { StashEntryAction } from '../../../src/webview/features/changes/stashCommands';

const entry = {
    indexStatus: ' ',
    workTreeStatus: 'M',
    filePath: 'src/inner.ts',
} as const;

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
        expect(messageForSubmoduleBulkAction('modules/lib', ChangeBulkAction.StageAll)).toEqual({
            type: 'changes/submoduleStageAll',
            submodulePath: 'modules/lib',
        });
        expect(messageForSubmoduleBulkAction('modules/lib', ChangeBulkAction.AcceptAllTheirs)).toEqual({
            type: 'changes/submoduleAcceptAllTheirs',
            submodulePath: 'modules/lib',
        });
    });

    it('maps operation actions to submodule-scoped messages', () => {
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
