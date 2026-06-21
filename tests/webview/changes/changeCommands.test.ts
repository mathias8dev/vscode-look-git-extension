import { describe, expect, it } from 'vitest';
import {
    ChangeBulkAction,
    ChangeRowAction,
    bulkActionsFor,
    messageForBulkAction,
    messageForChangesToolbarCommand,
    messageForExplainRepositoryChanges,
    messageForExplainSelection,
    messageForRowAction,
    rowActionsFor,
} from '@webview/features/changes/changeCommands';
import { ChangeSectionId, type ChangeListItem, type ChangeSection } from '@webview/features/changes/changeTree';

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
        const actions = rowActionsFor(item(ChangeSectionId.Unstaged));
        expect(actions.map((action) => action.action)).toEqual([
            ChangeRowAction.Diff,
            ChangeRowAction.Stage,
            ChangeRowAction.Discard,
            ChangeRowAction.Open,
        ]);
        expect(actions.find((action) => action.action === ChangeRowAction.Diff)?.icon).toBe('diff');
        expect(actions.find((action) => action.action === ChangeRowAction.Discard)?.icon).toBe('discard');
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
        expect(messageForBulkAction(ChangeBulkAction.OpenAllMergeEditors)).toEqual({ type: 'changes/openAllMergeEditors' });
    });

    it('creates protocol messages for toolbar commands', () => {
        expect(messageForChangesToolbarCommand('openGraph')).toEqual({ type: 'changes/toolbarCommand', command: 'openGraph' });
        expect(messageForChangesToolbarCommand('fetchAll')).toEqual({ type: 'changes/toolbarCommand', command: 'fetchAll' });
    });

    it('creates protocol messages for AI review actions', () => {
        const target = {
            kind: 'selection',
            filePaths: ['src/a.ts'],
            stageFilePaths: [],
            unstageFilePaths: [],
            discardFilePaths: [],
            stashFilePaths: [],
            patchStagedFilePaths: ['src/a.ts'],
            patchUnstagedFilePaths: [],
            patchUntrackedFilePaths: [],
            stashIncludeUntracked: false,
        } as const;
        expect(messageForExplainSelection(target)).toEqual({ type: 'changes/explainSelection', target });
        expect(messageForExplainRepositoryChanges('modules/lib')).toEqual({
            type: 'changes/explainRepositoryChanges',
            submodulePath: 'modules/lib',
        });
    });

    it('offers section bulk actions only where they make sense', () => {
        const unstaged: ChangeSection = { id: ChangeSectionId.Unstaged, title: 'Changes', items: [item(ChangeSectionId.Unstaged)] };
        const staged: ChangeSection = { id: ChangeSectionId.Staged, title: 'Staged', items: [item(ChangeSectionId.Staged)] };
        const conflicts: ChangeSection = { id: ChangeSectionId.Conflicts, title: 'Conflicts', items: [item(ChangeSectionId.Conflicts)] };
        expect(bulkActionsFor(unstaged).map((action) => action.action)).toEqual([
            ChangeBulkAction.StageAll,
            ChangeBulkAction.DiscardAll,
        ]);
        expect(bulkActionsFor(unstaged).find((action) => action.action === ChangeBulkAction.DiscardAll)?.icon).toBe('discard');
        expect(bulkActionsFor(staged).map((action) => action.action)).toEqual([ChangeBulkAction.UnstageAll]);
        expect(bulkActionsFor(conflicts).map((action) => action.action)).toEqual([
            ChangeBulkAction.OpenAllMergeEditors,
            ChangeBulkAction.AcceptAllTheirs,
        ]);
        expect(messageForBulkAction(ChangeBulkAction.AcceptAllTheirs)).toEqual({ type: 'changes/acceptAllTheirs' });
    });

    it('does not offer open-all merge editors for submodule gitlink conflicts', () => {
        const conflicts: ChangeSection = {
            id: ChangeSectionId.Conflicts,
            title: 'Conflicts',
            items: [{
                ...item(ChangeSectionId.Conflicts, 'modules/lib'),
                entry: { indexStatus: 'U', workTreeStatus: 'U', filePath: 'modules/lib', isSubmodule: true },
            }],
        };

        expect(bulkActionsFor(conflicts).map((action) => action.action)).toEqual([ChangeBulkAction.AcceptAllTheirs]);
    });
});
