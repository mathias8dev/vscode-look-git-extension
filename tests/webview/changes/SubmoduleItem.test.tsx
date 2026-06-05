// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmoduleStatusData } from '../../../src/protocol/changes/types';
import { ConflictState } from '../../../src/protocol/changes/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { OperationAction } from '../../../src/webview/features/changes/operationCommands';
import { SubmoduleAction } from '../../../src/webview/features/changes/submoduleCommands';
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

        fireEvent.click(screen.getByRole('button', { name: 'Open First' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open All' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Abort' }));

        expect(onOperationAction).toHaveBeenCalledWith(ConflictState.Merge, OperationAction.OpenFirstMergeEditor);
        expect(onOperationAction).toHaveBeenCalledWith(ConflictState.Merge, OperationAction.OpenAllMergeEditors);
        expect(onOperationAction).toHaveBeenCalledWith(ConflictState.Merge, OperationAction.Abort);
    });

    it('exposes submodule toolbar actions from the row header', () => {
        const onAction = vi.fn<(action: SubmoduleAction) => void>();
        const onReviewChanges = vi.fn();
        renderSubmodule({
            statusData: statusData(),
            onAction,
            onReviewChanges,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Refresh submodule changes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pull submodule' }));
        fireEvent.click(screen.getByRole('button', { name: 'Push submodule' }));
        fireEvent.click(screen.getByRole('button', { name: 'Review submodule changes' }));

        expect(onAction).toHaveBeenCalledWith(SubmoduleAction.Refresh);
        expect(onAction).toHaveBeenCalledWith(SubmoduleAction.Pull);
        expect(onAction).toHaveBeenCalledWith(SubmoduleAction.Push);
        expect(onReviewChanges).toHaveBeenCalledOnce();
    });

    it('reviews staged sections inside submodules and leaves conflicts without review', () => {
        const onExplainSelection = vi.fn();
        renderSubmodule({
            statusData: statusData({
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
            }),
            onExplainSelection,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }));

        expect(onExplainSelection).toHaveBeenCalledWith({
            kind: 'selection',
            submodulePath: 'modules/lib',
            filePaths: ['src/staged.ts'],
            stageFilePaths: [],
            unstageFilePaths: ['src/staged.ts'],
            discardFilePaths: [],
            stashFilePaths: ['src/staged.ts'],
            patchStagedFilePaths: ['src/staged.ts'],
            patchUnstagedFilePaths: [],
            patchUntrackedFilePaths: [],
            stashIncludeUntracked: false,
        });
        expect(screen.queryByRole('button', { name: 'Review conflicts' })).not.toBeInTheDocument();
    });

    it('marks the submodule more button as a native VS Code context menu target', () => {
        const onOpenContextMenu = vi.fn();
        renderSubmodule({
            statusData: statusData(),
            onOpenContextMenu,
        });

        const more = screen.getByRole('button', { name: 'More submodule actions' });
        expect(more.getAttribute('data-vscode-context')).toContain('changesSubmoduleToolbar');

        fireEvent.contextMenu(more);

        expect(onOpenContextMenu).toHaveBeenCalledOnce();
    });

    it('posts submodule-scoped selected changes as a native context menu target', () => {
        const onSelectionContextTarget = vi.fn();
        renderSubmodule({
            statusData: statusData({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [
                    { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
                    { indexStatus: '?', workTreeStatus: '?', filePath: 'src/new.ts' },
                ],
            }),
            onSelectionContextTarget,
        });

        const app = screen.getByTitle('src/app.ts');
        const staged = screen.getByTitle('src/staged.ts');
        fireEvent.click(app, { ctrlKey: true });
        fireEvent.click(staged, { ctrlKey: true });

        expect(staged).toHaveAttribute('aria-selected', 'true');
        expect(staged.getAttribute('data-vscode-context')).toContain('changesSelection');
        expect(staged.getAttribute('data-vscode-context')).toContain('changesSelectionCanExplainDiff');
        fireEvent.contextMenu(staged);

        expect(onSelectionContextTarget).toHaveBeenCalledWith({
            kind: 'selection',
            submodulePath: 'modules/lib',
            filePaths: ['src/app.ts', 'src/staged.ts'],
            stageFilePaths: ['src/app.ts'],
            unstageFilePaths: ['src/staged.ts'],
            discardFilePaths: ['src/app.ts'],
            stashFilePaths: ['src/app.ts', 'src/staged.ts'],
            patchStagedFilePaths: ['src/staged.ts'],
            patchUnstagedFilePaths: ['src/app.ts'],
            patchUntrackedFilePaths: [],
            stashIncludeUntracked: false,
        });
    });

    it('shows a busy refresh control while submodule status is loading', () => {
        renderSubmodule({
            statusData: statusData(),
            loadingStatus: true,
        });

        const refresh = screen.getByRole('button', { name: 'Refresh submodule changes' });
        expect(refresh).toHaveAttribute('aria-busy', 'true');
        expect(refresh).toBeDisabled();
    });
});

function renderSubmodule(input: {
    readonly statusData: SubmoduleStatusData;
    readonly loadingStatus?: boolean;
    readonly focusRequest?: number;
    readonly onAction?: (action: SubmoduleAction) => void;
    readonly onReviewChanges?: () => void;
    readonly onOpenContextMenu?: () => void;
    readonly onExplainSelection?: Parameters<typeof SubmoduleItem>[0]['onExplainSelection'];
    readonly onSelectionContextTarget?: Parameters<typeof SubmoduleItem>[0]['onSelectionContextTarget'];
    readonly onOperationAction?: (conflictState: ConflictState.Merge | ConflictState.Rebase, action: OperationAction) => void;
}): void {
    render(
        <SubmoduleItem
            submodule={{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }}
            expanded
            statusData={input.statusData}
            loadingStatus={input.loadingStatus ?? false}
            focusRequest={input.focusRequest ?? 0}
            onToggle={vi.fn()}
            onOpenContextMenu={input.onOpenContextMenu ?? vi.fn()}
            onAction={input.onAction ?? vi.fn()}
            onReviewChanges={input.onReviewChanges ?? vi.fn()}
            expandedStashIndexes={[]}
            stashFilesByIndex={{}}
            onRowAction={vi.fn()}
            onBulkAction={vi.fn()}
            onExplainSelection={input.onExplainSelection ?? vi.fn()}
            onSelectionContextTarget={input.onSelectionContextTarget ?? vi.fn()}
            onOperationAction={input.onOperationAction ?? vi.fn()}
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

function sectionChevron(title: string): HTMLElement {
    const section = screen.getByRole('heading', { name: title }).closest('.change-section');
    if (!(section instanceof HTMLElement)) { throw new Error(`Expected ${title} section.`); }
    const toggle = section.querySelector('.section-toggle');
    if (!(toggle instanceof HTMLElement)) { throw new Error(`Expected ${title} section toggle.`); }
    return toggle;
}
