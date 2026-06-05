// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmoduleStatusData } from '../../../src/protocol/changes/types';
import { ConflictState } from '../../../src/protocol/changes/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { ChangeRow } from '../../../src/webview/features/changes/ChangeRow';
import type { ChangeListItem, ChangeTreeNode } from '../../../src/webview/features/changes/changeTree';
import { ChangeSectionId } from '../../../src/webview/features/changes/changeTree';
import { changesSelectionContext } from '../../../src/webview/features/changes/context-menu-model';
import { SubmoduleItem } from '../../../src/webview/features/changes/SubmoduleItem';
import { StashFileRow } from '../../../src/webview/features/changes/StashFileRow';
import { StashItem } from '../../../src/webview/features/changes/StashItem';
import { TreeNodeView } from '../../../src/webview/features/changes/TreeNodeView';

describe('changes native context menu targets', () => {
    it('exposes the explain diff flag on selected change rows', () => {
        const context: unknown = JSON.parse(changesSelectionContext({
            canStage: true,
            canUnstage: false,
            canStash: true,
            canExplainDiff: true,
            canCreatePatch: true,
            canDiscard: true,
        }));

        expect(context).toEqual(expect.objectContaining({
            webviewSection: 'changesSelection',
            preventDefaultContextMenuItems: true,
            changesSelectionCanExplainDiff: true,
        }));
    });

    it('suppresses default VS Code context menu items on file rows', () => {
        render(
            <ChangeRow
                item={changeItem('src/app.ts')}
                depth={0}
                selected={false}
                context={JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
                onSelect={vi.fn()}
                onOpenContextMenu={vi.fn()}
                onAction={vi.fn()}
            />,
        );

        expectSuppressesDefaultItems(screen.getByTitle('src/app.ts'));
    });

    it('suppresses default VS Code context menu items on tree folder rows', () => {
        const node: ChangeTreeNode = {
            id: 'unstaged:folder:src',
            name: 'src',
            path: 'src',
            depth: 0,
            children: [],
        };

        render(
            <TreeNodeView
                node={node}
                selectedItemIds={new Set()}
                contextForItem={() => JSON.stringify({ webviewSection: 'changesSelection', preventDefaultContextMenuItems: true })}
                onSelectItem={vi.fn()}
                onOpenSelectionContext={vi.fn()}
                onRowAction={vi.fn()}
            />,
        );

        expectSuppressesDefaultItems(screen.getByRole('button', { name: 'src' }));
    });

    it('suppresses default VS Code context menu items on stash rows and files', () => {
        render(
            <StashItem
                stash={{ index: 0, message: 'On main: WIP' }}
                expanded
                files={[{ status: 'M', filePath: 'src/stashed.ts' }]}
                onToggle={vi.fn()}
                onAction={vi.fn()}
                onFileDiff={vi.fn()}
            />,
        );

        const stashRow = screen.getByText('On main: WIP').closest('.stash-item');
        if (!(stashRow instanceof HTMLElement)) { throw new Error('Expected stash row.'); }
        expectSuppressesDefaultItems(stashRow);
        expectSuppressesDefaultItems(screen.getByTitle('src/stashed.ts'));
    });

    it('suppresses default VS Code context menu items on standalone stash file rows', () => {
        render(
            <StashFileRow
                index={0}
                file={{ status: 'A', filePath: 'src/new-file.ts' }}
                onDiff={vi.fn()}
            />,
        );

        expectSuppressesDefaultItems(screen.getByTitle('src/new-file.ts'));
    });

    it('suppresses default items on submodule headers', () => {
        renderSubmodule(statusData({
            staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/app.ts' }],
        }));

        const header = screen.getByRole('button', { name: 'Hide changes' }).closest('.submodule-item-header');
        if (!(header instanceof HTMLElement)) { throw new Error('Expected submodule header.'); }
        expectSuppressesDefaultItems(header);
    });
});

function expectSuppressesDefaultItems(element: HTMLElement): void {
    const raw = element.getAttribute('data-vscode-context');
    expect(raw).not.toBeNull();
    const context: unknown = JSON.parse(raw ?? '{}');
    expect(context).toEqual(expect.objectContaining({ preventDefaultContextMenuItems: true }));
}

function changeItem(filePath: string): ChangeListItem {
    return {
        id: `unstaged:${filePath}`,
        section: ChangeSectionId.Unstaged,
        isStaged: false,
        entry: { indexStatus: ' ', workTreeStatus: 'M', filePath },
    };
}

function renderSubmodule(status: SubmoduleStatusData): void {
    render(
        <SubmoduleItem
            submodule={{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }}
            expanded
            statusData={status}
            loadingStatus={false}
            focusRequest={0}
            onToggle={vi.fn()}
            onOpenContextMenu={vi.fn()}
            onAction={vi.fn()}
            expandedStashIndexes={[]}
            stashFilesByIndex={{}}
            onRowAction={vi.fn()}
            onBulkAction={vi.fn()}
            onSelectionContextTarget={vi.fn()}
            onOperationAction={vi.fn()}
            commitFeedback={undefined}
            commitMessageGenerating={false}
            generatedCommitMessage={undefined}
            commitMessageGenerationError={undefined}
            onCommit={vi.fn()}
            onCommitComposerContextTarget={vi.fn()}
            onGenerateCommitMessage={vi.fn()}
            onCreateStash={vi.fn()}
            onToggleStash={vi.fn()}
            onStashAction={vi.fn()}
            onStashFileDiff={vi.fn()}
        />,
    );
}

function statusData(overrides: Partial<SubmoduleStatusData> = {}): SubmoduleStatusData {
    return {
        staged: overrides.staged ?? [],
        unstaged: overrides.unstaged ?? [],
        conflicts: overrides.conflicts ?? [],
        conflictState: overrides.conflictState ?? ConflictState.None,
        stashes: overrides.stashes ?? [],
    };
}
