import { describe, expect, it } from 'vitest';
import { bulkActionsFor, messageForBulkAction, messageForRowAction, rowActionsFor } from '../../../src/webview/features/changes/changeCommands';
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
        expect(rowActionsFor(item(ChangeSectionId.Unstaged)).map((action) => action.action)).toEqual(['diff', 'stage', 'discard', 'open']);
    });

    it('offers unstage actions for staged files', () => {
        expect(rowActionsFor(item(ChangeSectionId.Staged)).map((action) => action.action)).toEqual(['diff', 'unstage', 'open']);
    });

    it('offers conflict resolution entry points for conflicts', () => {
        expect(rowActionsFor(item(ChangeSectionId.Conflicts)).map((action) => action.action)).toEqual([
            'openMergeEditor',
            'acceptOurs',
            'acceptTheirs',
            'markResolved',
            'open',
        ]);
    });

    it('creates protocol messages for row actions', () => {
        const unstaged = item(ChangeSectionId.Unstaged, 'src/app.ts');
        expect(messageForRowAction(unstaged, 'stage')).toEqual({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, 'discard')).toEqual({ type: 'changes/discardFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, 'diff')).toEqual({
            type: 'changes/openDiff',
            filePath: 'src/app.ts',
            origPath: undefined,
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'M',
        });
    });

    it('creates protocol messages for conflict row actions', () => {
        const conflict = item(ChangeSectionId.Conflicts, 'src/conflicted.ts');
        expect(messageForRowAction(conflict, 'acceptOurs')).toEqual({
            type: 'changes/acceptOurs',
            filePath: 'src/conflicted.ts',
        });
        expect(messageForRowAction(conflict, 'acceptTheirs')).toEqual({
            type: 'changes/acceptTheirs',
            filePath: 'src/conflicted.ts',
        });
        expect(messageForRowAction(conflict, 'markResolved')).toEqual({
            type: 'changes/markResolved',
            filePath: 'src/conflicted.ts',
        });
    });

    it('opens submodules through the submodule command', () => {
        const submodule: ChangeListItem = {
            ...item(ChangeSectionId.Unstaged, 'modules/lib'),
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true },
        };
        expect(messageForRowAction(submodule, 'open')).toEqual({ type: 'changes/openSubmodule', filePath: 'modules/lib' });
    });

    it('omits unsafe row actions for submodules', () => {
        const submodule: ChangeListItem = {
            ...item(ChangeSectionId.Unstaged, 'modules/lib'),
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true },
        };
        expect(rowActionsFor(submodule).map((action) => action.action)).toEqual(['stage', 'open']);
    });

    it('creates protocol messages for bulk actions', () => {
        expect(messageForBulkAction('stageAll')).toEqual({ type: 'changes/stageAll' });
        expect(messageForBulkAction('unstageAll')).toEqual({ type: 'changes/unstageAll' });
        expect(messageForBulkAction('discardAll')).toEqual({ type: 'changes/discardAll' });
    });

    it('offers section bulk actions only where they make sense', () => {
        const unstaged: ChangeSection = { id: ChangeSectionId.Unstaged, title: 'Changes', items: [item(ChangeSectionId.Unstaged)] };
        const staged: ChangeSection = { id: ChangeSectionId.Staged, title: 'Staged', items: [item(ChangeSectionId.Staged)] };
        const conflicts: ChangeSection = { id: ChangeSectionId.Conflicts, title: 'Conflicts', items: [item(ChangeSectionId.Conflicts)] };
        expect(bulkActionsFor(unstaged).map((action) => action.action)).toEqual(['stageAll', 'discardAll']);
        expect(bulkActionsFor(staged).map((action) => action.action)).toEqual(['unstageAll']);
        expect(bulkActionsFor(conflicts).map((action) => action.action)).toEqual(['acceptAllTheirs']);
        expect(messageForBulkAction('acceptAllTheirs')).toEqual({ type: 'changes/acceptAllTheirs' });
    });
});
