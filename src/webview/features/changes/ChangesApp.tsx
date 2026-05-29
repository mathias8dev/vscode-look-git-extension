import { useMemo } from 'react';
import { ConflictState, RepositoryState } from '../../../protocol/changes/types';
import type { CommitMode, StashFileEntry } from '../../../protocol/changes/types';
import { ErrorNotice } from '../../shared/ErrorNotice';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { ChangeSectionView } from './ChangeSectionView';
import { CommitComposer } from './CommitComposer';
import { EmptyState } from './EmptyState';
import { OperationBanner } from './OperationBanner';
import { StashList } from './StashList';
import { buildChangeSections, type ChangeListItem, type ChangeSectionId } from './changeTree';
import {
    getChangeCount,
    type ChangeSelectionMode,
    type ChangesState,
} from './changesState';
import { filterAndSortSections, flattenedItems } from './changeViewModel';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import type { CreateStashKind, StashEntryAction } from './stashCommands';

interface ChangesAppProps {
    readonly state: ChangesState;
    readonly onSectionToggle: (sectionId: ChangeSectionId) => void;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode, visibleItemIds: readonly string[]) => void;
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
    onSectionToggle,
    onSelectItem,
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
    const selectedItemIds = useMemo(() => new Set(state.selectedItemIds), [state.selectedItemIds]);
    const changeCount = getChangeCount(state.status);
    const visibleChangeCount = visibleItemIds.length;
    const hasRepository = state.status.repositoryState !== RepositoryState.Missing;

    return (
        <main className="changes-shell">
            <ErrorNotice error={state.error} />

            {!state.loading && hasRepository ? operationBannerFor(state.status.conflictState, state.status.conflicts.length, onOperationAction) : null}

            {!state.loading && hasRepository ? (
                <CommitComposer
                    stagedCount={state.status.staged.length}
                    conflictState={state.status.conflictState}
                    feedback={state.commitFeedback}
                    onCommit={onCommit}
                />
            ) : null}

            <section className="changes-content" aria-label="Repository changes">
                {state.loading ? <EmptyState title="Loading" subtitle="Reading repository state…" icon="loading" iconSpin /> : null}
                {!state.loading && !hasRepository ? <EmptyState title="No repository" subtitle="Open a Git repository to see changes" icon="source-control" /> : null}
                {!state.loading && hasRepository && changeCount === 0 ? <EmptyState title="No changes" subtitle="Working tree is clean" icon="pass" /> : null}
                {!state.loading && hasRepository && changeCount > 0 && visibleChangeCount === 0 ? <EmptyState title="No matches" subtitle="Adjust the path filter" icon="search" /> : null}
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

function operationBannerFor(
    conflictState: ConflictState,
    conflictCount: number,
    onOperationAction: (conflictState: ActiveConflictState, action: OperationAction) => void,
) {
    if (conflictState === ConflictState.None) { return null; }
    return (
        <OperationBanner
            conflictState={conflictState}
            conflictCount={conflictCount}
            onAction={(action) => onOperationAction(conflictState, action)}
        />
    );
}
