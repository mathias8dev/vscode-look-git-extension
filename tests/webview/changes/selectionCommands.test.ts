import { describe, expect, it } from 'vitest';
import { messageForSelectionAction, selectionActionsFor } from '../../../src/webview/features/changes/selectionCommands';
import type { ChangeListItem } from '../../../src/webview/features/changes/changeTree';

function item(section: ChangeListItem['section'], filePath: string): ChangeListItem {
    return {
        id: `${section}:${filePath}:`,
        section,
        isStaged: section === 'staged',
        entry: {
            indexStatus: section === 'staged' ? 'M' : ' ',
            workTreeStatus: section === 'staged' ? ' ' : 'M',
            filePath,
        },
    };
}

describe('selectionCommands', () => {
    it('offers contextual actions for selected changes', () => {
        expect(selectionActionsFor([item('unstaged', 'a.ts')]).map((action) => action.action)).toEqual([
            'open',
            'diff',
            'stage',
            'discard',
        ]);

        expect(selectionActionsFor([item('staged', 'a.ts'), item('conflicts', 'b.ts')]).map((action) => action.action)).toEqual([
            'unstage',
            'acceptOurs',
            'acceptTheirs',
            'markResolved',
        ]);
    });

    it('creates batch messages for selected files', () => {
        const selected = [item('unstaged', 'a.ts'), item('unstaged', 'b.ts'), item('staged', 'c.ts')];
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
        const selected = [item('unstaged', 'a.ts')];
        expect(messageForSelectionAction(selected, 'open')).toEqual({
            type: 'changes/openFile',
            filePath: 'a.ts',
        });
        expect(messageForSelectionAction(selected, 'diff')).toEqual(expect.objectContaining({
            type: 'changes/openDiff',
            filePath: 'a.ts',
        }));
    });
});
