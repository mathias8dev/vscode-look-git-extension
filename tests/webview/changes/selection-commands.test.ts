import { describe, expect, it } from 'vitest';
import { ChangeSelectionAction, messageForSelectionAction, selectionActionsFor } from '@webview/features/changes/selection-commands';
import { ChangeSectionId, type ChangeListItem } from '@webview/features/changes/change-tree';

function item(section: ChangeSectionId, filePath: string): ChangeListItem {
    return {
        id: `${section}:${filePath}:`,
        section,
        isStaged: section === ChangeSectionId.Staged,
        entry: {
            indexStatus: section === ChangeSectionId.Staged ? 'M' : ' ',
            workTreeStatus: section === ChangeSectionId.Staged ? ' ' : 'M',
            filePath,
        },
    };
}

function submodule(section: ChangeSectionId, filePath: string): ChangeListItem {
    return {
        ...item(section, filePath),
        entry: {
            ...item(section, filePath).entry,
            isSubmodule: true,
        },
    };
}

describe('selectionCommands', () => {
    it('offers contextual actions for selected changes', () => {
        const actions = selectionActionsFor([item(ChangeSectionId.Unstaged, 'a.ts')]);
        expect(actions.map((action) => action.action)).toEqual([
            ChangeSelectionAction.Diff,
            ChangeSelectionAction.Open,
            ChangeSelectionAction.Stage,
            ChangeSelectionAction.Discard,
        ]);
        expect(actions.find((action) => action.action === ChangeSelectionAction.Diff)?.icon).toBe('diff');
        expect(actions.find((action) => action.action === ChangeSelectionAction.Discard)?.icon).toBe('discard');

        expect(selectionActionsFor([item(ChangeSectionId.Staged, 'a.ts'), item(ChangeSectionId.Conflicts, 'b.ts')]).map((action) => action.action)).toEqual([
            ChangeSelectionAction.Unstage,
            ChangeSelectionAction.AcceptOurs,
            ChangeSelectionAction.AcceptTheirs,
            ChangeSelectionAction.MarkResolved,
        ]);
    });

    it('creates batch messages for selected files', () => {
        const selected = [item(ChangeSectionId.Unstaged, 'a.ts'), item(ChangeSectionId.Unstaged, 'b.ts'), item(ChangeSectionId.Staged, 'c.ts')];
        expect(messageForSelectionAction(selected, ChangeSelectionAction.Stage)).toEqual({
            type: 'changes/stageFiles',
            filePaths: ['a.ts', 'b.ts'],
        });
        expect(messageForSelectionAction(selected, ChangeSelectionAction.Unstage)).toEqual({
            type: 'changes/unstageFiles',
            filePaths: ['c.ts'],
        });
    });

    it('uses single-file messages for open and diff', () => {
        const selected = [item(ChangeSectionId.Unstaged, 'a.ts')];
        expect(messageForSelectionAction(selected, ChangeSelectionAction.Open)).toEqual({
            type: 'changes/openFile',
            filePath: 'a.ts',
        });
        expect(messageForSelectionAction(selected, ChangeSelectionAction.Diff)).toEqual(expect.objectContaining({
            type: 'changes/openDiff',
            filePath: 'a.ts',
        }));
    });

    it('excludes submodules from unsafe selection actions', () => {
        const selected = [submodule(ChangeSectionId.Unstaged, 'modules/lib'), item(ChangeSectionId.Unstaged, 'src/app.ts')];
        expect(selectionActionsFor(selected).map((action) => action.action)).toEqual([
            ChangeSelectionAction.Stage,
            ChangeSelectionAction.Discard,
        ]);
        expect(messageForSelectionAction(selected, ChangeSelectionAction.Discard)).toEqual({
            type: 'changes/discardFiles',
            filePaths: ['src/app.ts'],
        });
    });
});
