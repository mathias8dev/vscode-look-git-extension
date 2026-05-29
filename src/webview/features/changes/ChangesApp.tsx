import { useMemo } from 'react';
import type { CommitMode, ConflictState, StashFileEntry } from '../../../protocol/changes/types';
import { ErrorNotice } from '../../shared/ErrorNotice';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { ChangeSectionView } from './ChangeSectionView';
import { ChangesToolbar } from './ChangesToolbar';
import { CommitComposer } from './CommitComposer';
import { EmptyState } from './EmptyState';
import { OperationBanner } from './OperationBanner';
import { SelectionToolbar } from './SelectionToolbar';
import { StashList } from './StashList';
import { buildChangeSections, type ChangeListItem, type ChangeSectionId } from './changeTree';
import {
    getChangeCount,
    type ChangeSelectionMode,
    type ChangesSortMode,
    type ChangesState,
    type ChangesViewMode,
} from './changesState';
import { filterAndSortSections, flattenedItems, selectedItemsForIds } from './changeViewModel';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import type { ChangeSelectionAction } from './selectionCommands';
import type { CreateStashKind, StashEntryAction } from './stashCommands';

interface ChangesAppProps {
    readonly state: ChangesState;
    readonly onViewModeChange: (viewMode: ChangesViewMode) => void;
    readonly onSortModeChange: (sortMode: ChangesSortMode) => void;
    readonly onPathFilterChange: (pathFilter: string) => void;
    readonly onSectionToggle: (sectionId: ChangeSectionId) => void;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode, visibleItemIds: readonly string[]) => void;
    readonly onClearSelection: () => void;
    readonly onSelectionAction: (items: readonly ChangeListItem[], action: ChangeSelectionAction) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (action: ChangeBulkAction) => void;
    readonly onCommit: (message: string, mode: CommitMode) => void;
    readonly onOperationAction: (conflictState: ActiveConflictState, action: OperationAction) => void;
    readonly onCreateStash: (kind: CreateStashKind, message: string) => void;
    readonly onToggleStash: (index: number) => void;
    readonly onStashAction: (index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (index: number, file: StashFileEntry) => void;
}

export function ChangesApp({
    state,
    onViewModeChange,
    onSortModeChange,
    onPathFilterChange,
    onSectionToggle,
    onSelectItem,
    onClearSelection,
    onSelectionAction,
    onRowAction,
    onBulkAction,
    onCommit,
    onOperationAction,
    onCreateStash,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
}: ChangesAppProps) {
    const rawSections = useMemo(() => buildChangeSections(state.status), [state.status]);
    const sections = useMemo(
        () => filterAndSortSections(rawSections, state.pathFilter, state.sortMode),
        [rawSections, state.pathFilter, state.sortMode],
    );
    const visibleItemIds = useMemo(() => flattenedItems(sections).map((item) => item.id), [sections]);
    const selectedItems = useMemo(
        () => selectedItemsForIds(sections, state.selectedItemIds),
        [sections, state.selectedItemIds],
    );
    const selectedItemIds = useMemo(() => new Set(state.selectedItemIds), [state.selectedItemIds]);
    const changeCount = getChangeCount(state.status);
    const visibleChangeCount = visibleItemIds.length;
    const hasRepository = state.status.repositoryState !== 'missing';

    return (
        <main className="changes-shell">
            <header className="changes-header">
                <div>
                    <h1>Changes</h1>
                    <p>{summaryText(state.loading, hasRepository, changeCount, visibleChangeCount, state.pathFilter)}</p>
                </div>
            </header>

            {!state.loading && hasRepository ? (
                <ChangesToolbar
                    pathFilter={state.pathFilter}
                    sortMode={state.sortMode}
                    viewMode={state.viewMode}
                    onPathFilterChange={onPathFilterChange}
                    onSortModeChange={onSortModeChange}
                    onViewModeChange={onViewModeChange}
                />
            ) : null}

            <ErrorNotice error={state.error} />

            {!state.loading && hasRepository ? operationBannerFor(state.status.conflictState, state.status.conflicts.length, onOperationAction) : null}

            {!state.loading && hasRepository ? (
                <CommitComposer
                    stagedCount={state.status.staged.length}
                    conflictState={state.status.conflictState}
                    feedback={state.commitFeedback}
                    history={state.commitMessageHistory}
                    onCommit={onCommit}
                />
            ) : null}

            <SelectionToolbar
                selectedItems={selectedItems}
                onAction={(action) => onSelectionAction(selectedItems, action)}
                onClear={onClearSelection}
            />

            <section className="changes-content" aria-label="Repository changes">
                {state.loading ? <EmptyState title="Loading changes" /> : null}
                {!state.loading && !hasRepository ? <EmptyState title="No repository" /> : null}
                {!state.loading && hasRepository && changeCount === 0 ? <EmptyState title="Clean working tree" /> : null}
                {!state.loading && hasRepository && changeCount > 0 && visibleChangeCount === 0 ? <EmptyState title="No matching changes" /> : null}
                {!state.loading && hasRepository && visibleChangeCount > 0 ? sections.map((section) => (
                    <ChangeSectionView
                        key={section.id}
                        section={section}
                        viewMode={state.viewMode}
                        collapsed={state.collapsedSectionIds.includes(section.id)}
                        selectedItemIds={selectedItemIds}
                        onToggleCollapsed={() => onSectionToggle(section.id)}
                        onSelectItem={(item, mode) => onSelectItem(item, mode, visibleItemIds)}
                        onRowAction={onRowAction}
                        onBulkAction={onBulkAction}
                    />
                )) : null}
                {!state.loading && hasRepository ? (
                    <StashList
                        stashes={state.status.stashes}
                        changeCount={changeCount}
                        stagedCount={state.status.staged.length}
                        expandedIndexes={state.expandedStashIndexes}
                        filesByIndex={state.stashFilesByIndex}
                        onToggleStash={onToggleStash}
                        onCreateStash={onCreateStash}
                        onStashAction={onStashAction}
                        onStashFileDiff={onStashFileDiff}
                    />
                ) : null}
            </section>
        </main>
    );
}

function summaryText(
    loading: boolean,
    hasRepository: boolean,
    changeCount: number,
    visibleChangeCount: number,
    pathFilter: string,
): string {
    if (loading) { return 'Loading repository state'; }
    if (!hasRepository) { return 'No repository'; }
    if (pathFilter.trim()) {
        return `${visibleChangeCount} of ${changeText(changeCount)}`;
    }
    return changeText(changeCount);
}

function changeText(count: number): string {
    return count === 1 ? '1 changed file' : `${count} changed files`;
}

function operationBannerFor(
    conflictState: ConflictState,
    conflictCount: number,
    onOperationAction: (conflictState: ActiveConflictState, action: OperationAction) => void,
) {
    if (conflictState === 'none') { return null; }
    return (
        <OperationBanner
            conflictState={conflictState}
            conflictCount={conflictCount}
            onAction={(action) => onOperationAction(conflictState, action)}
        />
    );
}
