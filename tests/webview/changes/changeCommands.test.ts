import { describe, expect, it } from 'vitest';
import {
    ChangeBulkAction,
    ChangeRowAction,
    bulkActionsFor,
    messageForBulkAction,
    messageForChangesToolbarCommand,
    messageForRowAction,
    rowActionsFor,
} from '../../../src/webview/features/changes/changeCommands';
import { ChangeSectionId, type ChangeListItem, type ChangeSection } from '../../../src/webview/features/changes/changeTree';

function item(section: ChangeSectionId, filePath = 'src/app.ts'): ChangeListItem {
    return {
        id: `${section}:${filePath}`,
        section,
        isStaged: section === ChangeSectionId.Staged,
        entry: { indexStatus: section === ChangeSectionId.Staged ? 'M' : ' ', workTreeStatus: section === ChangeSectionId.Staged ? ' ' : 'M', filePath },
    };
}

describe('changeCommands', () => {
    it('offers stage/discard actions for unstaged files', () => {
        expect(rowActionsFor(item(ChangeSectionId.Unstaged)).map((action) => action.action)).toEqual([
            ChangeRowAction.Diff,
            ChangeRowAction.Stage,
            ChangeRowAction.Discard,
            ChangeRowAction.Open,
        ]);
    });

    it('offers unstage actions for staged files', () => {
        expect(rowActionsFor(item(ChangeSectionId.Staged)).map((action) => action.action)).toEqual([
            ChangeRowAction.Diff,
            ChangeRowAction.Unstage,
            ChangeRowAction.Open,
        ]);
    });

    it('offers conflict resolution entry points for conflicts', () => {
        expect(rowActionsFor(item(ChangeSectionId.Conflicts)).map((action) => action.action)).toEqual([
            ChangeRowAction.OpenMergeEditor,
            ChangeRowAction.AcceptOurs,
            ChangeRowAction.AcceptTheirs,
            ChangeRowAction.MarkResolved,
            ChangeRowAction.Open,
        ]);
    });

    it('creates protocol messages for row actions', () => {
        const unstaged = item(ChangeSectionId.Unstaged, 'src/app.ts');
        expect(messageForRowAction(unstaged, ChangeRowAction.Stage)).toEqual({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, ChangeRowAction.Discard)).toEqual({ type: 'changes/discardFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, ChangeRowAction.Diff)).toEqual({
            type: 'changes/openDiff',
            filePath: 'src/app.ts',
            origPath: undefined,
            isSubmodule: undefined,
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'M',
        });
    });

    it('creates protocol messages for conflict row actions', () => {
        const conflict = item(ChangeSectionId.Conflicts, 'src/conflicted.ts');
        expect(messageForRowAction(conflict, ChangeRowAction.AcceptOurs)).toEqual({
            type: 'changes/acceptOurs',
            filePath: 'src/conflicted.ts',
        });
        expect(messageForRowAction(conflict, ChangeRowAction.AcceptTheirs)).toEqual({
            type: 'changes/acceptTheirs',
            filePath: 'src/conflicted.ts',
        });
        expect(messageForRowAction(conflict, ChangeRowAction.MarkResolved)).toEqual({
            type: 'changes/markResolved',
            filePath: 'src/conflicted.ts',
        });
    });

    it('opens submodules through the submodule command', () => {
        const submodule: ChangeListItem = {
            ...item(ChangeSectionId.Unstaged, 'modules/lib'),
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true },
        };
        expect(messageForRowAction(submodule, ChangeRowAction.Open)).toEqual({ type: 'changes/openSubmodule', filePath: 'modules/lib' });
    });

    it('offers gitlink diffs and safe row actions for submodules', () => {
        const submodule: ChangeListItem = {
            ...item(ChangeSectionId.Unstaged, 'modules/lib'),
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true },
        };
        expect(rowActionsFor(submodule).map((action) => action.action)).toEqual([
            ChangeRowAction.Diff,
            ChangeRowAction.Stage,
            ChangeRowAction.Open,
        ]);
        expect(messageForRowAction(submodule, ChangeRowAction.Diff)).toEqual({
            type: 'changes/openDiff',
            filePath: 'modules/lib',
            origPath: undefined,
            isSubmodule: true,
            isStaged: false,
            indexStatus: 'M',
            workTreeStatus: ' ',
        });
    });

    it('creates protocol messages for bulk actions', () => {
        expect(messageForBulkAction(ChangeBulkAction.StageAll)).toEqual({ type: 'changes/stageAll' });
        expect(messageForBulkAction(ChangeBulkAction.UnstageAll)).toEqual({ type: 'changes/unstageAll' });
        expect(messageForBulkAction(ChangeBulkAction.DiscardAll)).toEqual({ type: 'changes/discardAll' });
    });

    it('creates protocol messages for toolbar commands', () => {
        expect(messageForChangesToolbarCommand('openGraph')).toEqual({ type: 'changes/toolbarCommand', command: 'openGraph' });
        expect(messageForChangesToolbarCommand('fetchAll')).toEqual({ type: 'changes/toolbarCommand', command: 'fetchAll' });
    });

    it('offers section bulk actions only where they make sense', () => {
        const unstaged: ChangeSection = { id: ChangeSectionId.Unstaged, title: 'Changes', items: [item(ChangeSectionId.Unstaged)] };
        const staged: ChangeSection = { id: ChangeSectionId.Staged, title: 'Staged', items: [item(ChangeSectionId.Staged)] };
        const conflicts: ChangeSection = { id: ChangeSectionId.Conflicts, title: 'Conflicts', items: [item(ChangeSectionId.Conflicts)] };
        expect(bulkActionsFor(unstaged).map((action) => action.action)).toEqual([
            ChangeBulkAction.StageAll,
            ChangeBulkAction.DiscardAll,
        ]);
        expect(bulkActionsFor(staged).map((action) => action.action)).toEqual([ChangeBulkAction.UnstageAll]);
        expect(bulkActionsFor(conflicts).map((action) => action.action)).toEqual([ChangeBulkAction.AcceptAllTheirs]);
        expect(messageForBulkAction(ChangeBulkAction.AcceptAllTheirs)).toEqual({ type: 'changes/acceptAllTheirs' });
    });
});
