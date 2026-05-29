import { describe, expect, it } from 'vitest';
import { bulkActionsFor, messageForBulkAction, messageForRowAction, rowActionsFor } from '../../../src/webview/features/changes/changeCommands';
import type { ChangeListItem, ChangeSection } from '../../../src/webview/features/changes/changeTree';

function item(section: ChangeListItem['section'], filePath = 'src/app.ts'): ChangeListItem {
    return {
        id: `${section}:${filePath}`,
        section,
        isStaged: section === 'staged',
        entry: { indexStatus: section === 'staged' ? 'M' : ' ', workTreeStatus: section === 'staged' ? ' ' : 'M', filePath },
    };
}

describe('changeCommands', () => {
    it('offers stage/discard actions for unstaged files', () => {
        expect(rowActionsFor(item('unstaged')).map((action) => action.action)).toEqual(['stage', 'discard', 'open', 'diff']);
    });

    it('offers unstage actions for staged files', () => {
        expect(rowActionsFor(item('staged')).map((action) => action.action)).toEqual(['unstage', 'open', 'diff']);
    });

    it('offers conflict resolution entry points for conflicts', () => {
        expect(rowActionsFor(item('conflicts')).map((action) => action.action)).toEqual(['openMergeEditor', 'markResolved', 'open', 'diff']);
    });

    it('creates protocol messages for row actions', () => {
        const unstaged = item('unstaged', 'src/app.ts');
        expect(messageForRowAction(unstaged, 'stage')).toEqual({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, 'discard')).toEqual({ type: 'changes/discardFile', filePath: 'src/app.ts' });
        expect(messageForRowAction(unstaged, 'diff')).toEqual({
            type: 'changes/openDiff',
            filePath: 'src/app.ts',
            origPath: undefined,
            isStaged: false,
            status: 'M',
        });
    });

    it('opens submodules through the submodule command', () => {
        const submodule: ChangeListItem = {
            ...item('unstaged', 'modules/lib'),
            entry: { indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true },
        };
        expect(messageForRowAction(submodule, 'open')).toEqual({ type: 'changes/openSubmodule', filePath: 'modules/lib' });
    });

    it('creates protocol messages for bulk actions', () => {
        expect(messageForBulkAction('stageAll')).toEqual({ type: 'changes/stageAll' });
        expect(messageForBulkAction('unstageAll')).toEqual({ type: 'changes/unstageAll' });
        expect(messageForBulkAction('discardAll')).toEqual({ type: 'changes/discardAll' });
    });

    it('offers section bulk actions only where they make sense', () => {
        const unstaged: ChangeSection = { id: 'unstaged', title: 'Changes', items: [item('unstaged')] };
        const staged: ChangeSection = { id: 'staged', title: 'Staged', items: [item('staged')] };
        const conflicts: ChangeSection = { id: 'conflicts', title: 'Conflicts', items: [item('conflicts')] };
        expect(bulkActionsFor(unstaged).map((action) => action.action)).toEqual(['stageAll', 'discardAll']);
        expect(bulkActionsFor(staged).map((action) => action.action)).toEqual(['unstageAll']);
        expect(bulkActionsFor(conflicts)).toEqual([]);
    });
});
