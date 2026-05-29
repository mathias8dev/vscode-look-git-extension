import { describe, expect, it } from 'vitest';
import { messageForSelectionAction, selectionActionsFor } from '../../../src/webview/features/changes/selectionCommands';
import { ChangeSectionId, type ChangeListItem } from '../../../src/webview/features/changes/changeTree';

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
        expect(selectionActionsFor([item(ChangeSectionId.Unstaged, 'a.ts')]).map((action) => action.action)).toEqual([
            'diff',
            'open',
            'stage',
            'discard',
        ]);

        expect(selectionActionsFor([item(ChangeSectionId.Staged, 'a.ts'), item(ChangeSectionId.Conflicts, 'b.ts')]).map((action) => action.action)).toEqual([
            'unstage',
            'acceptOurs',
            'acceptTheirs',
            'markResolved',
        ]);
    });

    it('creates batch messages for selected files', () => {
        const selected = [item(ChangeSectionId.Unstaged, 'a.ts'), item(ChangeSectionId.Unstaged, 'b.ts'), item(ChangeSectionId.Staged, 'c.ts')];
        expect(messageForSelectionAction(selected, 'stage')).toEqual({
            type: 'changes/stageFiles',
            filePaths: ['a.ts', 'b.ts'],
        });
        expect(messageForSelectionAction(selected, 'unstage')).toEqual({
            type: 'changes/unstageFiles',
            filePaths: ['c.ts'],
        });
    });

    it('uses single-file messages for open and diff', () => {
        const selected = [item(ChangeSectionId.Unstaged, 'a.ts')];
        expect(messageForSelectionAction(selected, 'open')).toEqual({
            type: 'changes/openFile',
            filePath: 'a.ts',
        });
        expect(messageForSelectionAction(selected, 'diff')).toEqual(expect.objectContaining({
            type: 'changes/openDiff',
            filePath: 'a.ts',
        }));
    });

    it('excludes submodules from unsafe selection actions', () => {
        const selected = [submodule(ChangeSectionId.Unstaged, 'modules/lib'), item(ChangeSectionId.Unstaged, 'src/app.ts')];
        expect(selectionActionsFor(selected).map((action) => action.action)).toEqual(['stage', 'discard']);
        expect(messageForSelectionAction(selected, 'discard')).toEqual({
            type: 'changes/discardFiles',
            filePaths: ['src/app.ts'],
        });
    });
});
