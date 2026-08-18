// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeRow } from '@webview/features/changes/change-row';
import { ChangeRowAction, primaryRowActionFor } from '@webview/features/changes/change-commands';
import { ChangeSectionId, type ChangeListItem } from '@webview/features/changes/change-tree';
import { ChangeSelectionMode } from '@webview/features/changes/changes-state';

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
        const row = screen.getByTitle('src/app.ts');
        fireEvent.click(row);

        expect(onAction).toHaveBeenCalledWith(item, ChangeRowAction.Diff);

        // Row actions are mounted only while the row is hovered/focused/selected.
        expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull();
        fireEvent.mouseEnter(row);

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

    it('uses the keyboard context menu key to select and target a change row', () => {
        const item = changeItem(ChangeSectionId.Unstaged, 'src/app.ts', ' ', 'M');
        const onSelect = vi.fn<(item: ChangeListItem, mode: ChangeSelectionMode) => void>();
        const onOpenContextMenu = vi.fn<(item: ChangeListItem) => void>();

        render(
            <ChangeRow
                item={item}
                depth={0}
                selected={false}
                context={JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
                onSelect={onSelect}
                onOpenContextMenu={onOpenContextMenu}
                onAction={vi.fn()}
            />,
        );

        fireEvent.keyDown(screen.getByTitle('src/app.ts'), { key: 'ContextMenu' });

        expect(onSelect).toHaveBeenCalledWith(item, ChangeSelectionMode.Replace);
        expect(onOpenContextMenu).toHaveBeenCalledWith(item);
    });

    it('extends selection with shift arrow keys', () => {
        const first = changeItem(ChangeSectionId.Unstaged, 'src/first.ts', ' ', 'M');
        const second = changeItem(ChangeSectionId.Unstaged, 'src/second.ts', ' ', 'M');
        const onSelect = vi.fn<(item: ChangeListItem, mode: ChangeSelectionMode) => void>();

        render(
            <div>
                <ChangeRow
                    item={first}
                    depth={0}
                    selected={true}
                    context={JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
                    onSelect={onSelect}
                    onOpenContextMenu={vi.fn()}
                    onAction={vi.fn()}
                />
                <ChangeRow
                    item={second}
                    depth={0}
                    selected={false}
                    context={JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
                    onSelect={onSelect}
                    onOpenContextMenu={vi.fn()}
                    onAction={vi.fn()}
                />
            </div>,
        );

        const firstRow = screen.getByTitle('src/first.ts');
        const secondRow = screen.getByTitle('src/second.ts');
        firstRow.focus();

        fireEvent.keyDown(firstRow, { key: 'ArrowDown', shiftKey: true });

        expect(secondRow).toHaveFocus();
        expect(onSelect).toHaveBeenCalledWith(second, ChangeSelectionMode.Range);
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
