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

        const { container } = renderRow(item, onAction);
        fireEvent.click(screen.getByTitle('src/app.ts'));

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.Diff);
        expect(container.querySelector('.codicon-git-compare')).toBeNull();
        expect(container.querySelector('.codicon-diff')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
        expect(container.querySelector('.codicon-discard')).not.toBeNull();
        expect(container.querySelector('.codicon-trash')).toBeNull();
    });

    it('opens the gitlink diff as the primary row action for submodule gitlinks', () => {
        const onAction = vi.fn<(item: ChangeListItem, action: ChangeRowAction) => void>();
        const item: ChangeListItem = {
            ...changeItem(ChangeSectionId.Unstaged, 'modules/lib', ' ', 'M'),
            entry: { indexStatus: ' ', workTreeStatus: 'M', filePath: 'modules/lib', isSubmodule: true },
        };

        renderRow(item, onAction);
        fireEvent.click(screen.getByTitle('modules/lib'));

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.Diff);
        expect(primaryRowActionFor({
            ...changeItem(ChangeSectionId.Unstaged, 'modules/lib', ' ', 'M'),
            entry: { indexStatus: ' ', workTreeStatus: 'M', filePath: 'modules/lib', isSubmodule: true },
        })).toBe(ChangeRowAction.Diff);
    });
});

function renderRow(
    item: ChangeListItem,
    onAction: (item: ChangeListItem, action: ChangeRowAction) => void,
): ReturnType<typeof render> {
    return render(
        <ChangeRow
            item={item}
            depth={0}
            selected={false}
            context={JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
            onSelect={vi.fn()}
            onOpenContextMenu={vi.fn()}
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
