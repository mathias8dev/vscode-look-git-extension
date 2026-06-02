// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeRow } from '../../../src/webview/features/changes/ChangeRow';
import { ChangeRowAction, primaryRowActionFor } from '../../../src/webview/features/changes/changeCommands';
import { ChangeSectionId, type ChangeListItem } from '../../../src/webview/features/changes/changeTree';

describe('ChangeRow', () => {
    it('opens the merge editor when clicking a conflict file', () => {
        const onAction = vi.fn<(item: ChangeListItem, action: ChangeRowAction) => void>();
        const item = changeItem(ChangeSectionId.Conflicts, 'src/conflicted.ts', 'U', 'U');

        renderRow(item, onAction);
        fireEvent.click(screen.getByTitle('src/conflicted.ts'));

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.OpenMergeEditor);
    });

    it('opens the merge editor from keyboard enter on a conflict file', () => {
        const onAction = vi.fn<(item: ChangeListItem, action: ChangeRowAction) => void>();
        const item = changeItem(ChangeSectionId.Conflicts, 'src/conflicted.ts', 'U', 'U');

        renderRow(item, onAction);
        fireEvent.keyDown(screen.getByTitle('src/conflicted.ts'), { key: 'Enter' });

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.OpenMergeEditor);
    });

    it('keeps opening diffs as the primary action for non-conflict files', () => {
        const onAction = vi.fn<(item: ChangeListItem, action: ChangeRowAction) => void>();
        const item = changeItem(ChangeSectionId.Unstaged, 'src/app.ts', ' ', 'M');

        renderRow(item, onAction);
        fireEvent.click(screen.getByTitle('src/app.ts'));

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.Diff);
    });

    it('does not assign a primary row action to submodule gitlinks', () => {
        expect(primaryRowActionFor({
            ...changeItem(ChangeSectionId.Unstaged, 'modules/lib', ' ', 'M'),
            entry: { indexStatus: ' ', workTreeStatus: 'M', filePath: 'modules/lib', isSubmodule: true },
        })).toBeUndefined();
    });
});

function renderRow(
    item: ChangeListItem,
    onAction: (item: ChangeListItem, action: ChangeRowAction) => void,
): void {
    render(
        <ChangeRow
            item={item}
            depth={0}
            selected={false}
            onSelect={vi.fn()}
            onAction={onAction}
        />,
    );
}

function changeItem(section: ChangeSectionId, filePath: string, indexStatus: string, workTreeStatus: string): ChangeListItem {
    return {
        id: `${section}:${filePath}`,
        section,
        isStaged: section === ChangeSectionId.Staged,
        entry: { indexStatus, workTreeStatus, filePath },
    };
}
