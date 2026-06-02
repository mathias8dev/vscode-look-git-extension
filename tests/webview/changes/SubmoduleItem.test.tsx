// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmoduleStatusData } from '../../../src/protocol/changes/types';
import { ConflictState } from '../../../src/protocol/changes/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { OperationAction } from '../../../src/webview/features/changes/operationCommands';
import { SubmoduleItem } from '../../../src/webview/features/changes/SubmoduleItem';

describe('SubmoduleItem', () => {
    it('renders one compact empty state instead of empty sections', () => {
        renderSubmodule({
            statusData: statusData(),
        });

        expect(screen.getByText('No changes inside submodule')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Conflicts' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Staged' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Changes' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Stashed' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Commit message')).not.toBeInTheDocument();
    });

    it('shows only non-empty change and stash sections', () => {
        renderSubmodule({
            statusData: statusData({
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' }],
                stashes: [{ index: 0, message: 'On main: WIP' }],
            }),
        });

        expect(screen.getByRole('heading', { name: 'Changes' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Stashed' })).toBeInTheDocument();
        expect(screen.getByTitle('src/app.ts')).toBeInTheDocument();
        expect(screen.getByText('On main: WIP')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Conflicts' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Staged' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Commit message')).not.toBeInTheDocument();
    });

    it('shows the commit composer only when staged changes exist', () => {
        renderSubmodule({
            statusData: statusData({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/app.ts' }],
            }),
        });

        expect(screen.getByRole('heading', { name: 'Staged' })).toBeInTheDocument();
        expect(screen.getByLabelText('Commit message')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Changes' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Stashed' })).not.toBeInTheDocument();
    });

    it('toggles conflict, staged, changes, and stash sections inside submodules', () => {
        renderSubmodule({
            statusData: statusData({
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts' }],
                stashes: [{ index: 0, message: 'On main: WIP' }],
            }),
        });

        fireEvent.click(screen.getByRole('button', { name: /Conflicts/ }));
        expect(screen.queryByTitle('src/conflict.ts')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Conflicts/ }));
        expect(screen.getByTitle('src/conflict.ts')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('button', { name: /Staged/ }), { key: 'Enter' });
        expect(screen.queryByTitle('src/staged.ts')).not.toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: /Staged/ }), { key: 'Enter' });
        expect(screen.getByTitle('src/staged.ts')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('button', { name: /Changes/ }), { key: ' ' });
        expect(screen.queryByTitle('src/unstaged.ts')).not.toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: /Changes/ }), { key: ' ' });
        expect(screen.getByTitle('src/unstaged.ts')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Stashed/ }));
        expect(screen.queryByText('On main: WIP')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Stashed/ }));
        expect(screen.getByText('On main: WIP')).toBeInTheDocument();
    });

    it('toggles conflict, staged, changes, and stash sections from their chevron buttons', () => {
        renderSubmodule({
            statusData: statusData({
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts' }],
                stashes: [{ index: 0, message: 'On main: WIP' }],
            }),
        });

        fireEvent.click(sectionChevron('Conflicts'));
        expect(screen.queryByTitle('src/conflict.ts')).not.toBeInTheDocument();
        fireEvent.click(sectionChevron('Conflicts'));
        expect(screen.getByTitle('src/conflict.ts')).toBeInTheDocument();

        fireEvent.click(sectionChevron('Staged'));
        expect(screen.queryByTitle('src/staged.ts')).not.toBeInTheDocument();
        fireEvent.click(sectionChevron('Staged'));
        expect(screen.getByTitle('src/staged.ts')).toBeInTheDocument();

        fireEvent.click(sectionChevron('Changes'));
        expect(screen.queryByTitle('src/unstaged.ts')).not.toBeInTheDocument();
        fireEvent.click(sectionChevron('Changes'));
        expect(screen.getByTitle('src/unstaged.ts')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Collapse stashes'));
        expect(screen.queryByText('On main: WIP')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Expand stashes'));
        expect(screen.getByText('On main: WIP')).toBeInTheDocument();
    });

    it('shows continue and abort controls when the submodule has an active merge conflict', () => {
        const onOperationAction = vi.fn();
        renderSubmodule({
            statusData: statusData({
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: ConflictState.Merge,
            }),
            onOperationAction,
        });

        expect(screen.getByText('Merge in progress')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        fireEvent.click(screen.getByRole('button', { name: 'Abort' }));

        expect(onOperationAction).toHaveBeenCalledWith(ConflictState.Merge, OperationAction.Continue);
        expect(onOperationAction).toHaveBeenCalledWith(ConflictState.Merge, OperationAction.Abort);
    });
});

function renderSubmodule(input: {
    readonly statusData: SubmoduleStatusData;
    readonly onOperationAction?: (conflictState: ConflictState.Merge | ConflictState.Rebase, action: OperationAction) => void;
}): void {
    render(
        <SubmoduleItem
            submodule={{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }}
            expanded
            statusData={input.statusData}
            onToggle={vi.fn()}
            onAction={vi.fn()}
            expandedStashIndexes={[]}
            stashFilesByIndex={{}}
            onRowAction={vi.fn()}
            onBulkAction={vi.fn()}
            onOperationAction={input.onOperationAction ?? vi.fn()}
            commitFeedback={undefined}
            onCommit={vi.fn()}
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

function sectionChevron(title: string): HTMLElement {
    const section = screen.getByRole('heading', { name: title }).closest('.change-section');
    if (!(section instanceof HTMLElement)) { throw new Error(`Expected ${title} section.`); }
    const toggle = section.querySelector('.section-toggle');
    if (!(toggle instanceof HTMLElement)) { throw new Error(`Expected ${title} section toggle.`); }
    return toggle;
}
