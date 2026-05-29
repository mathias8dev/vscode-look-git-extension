import { useMemo } from 'react';
import type { CommitMode, ConflictState, StashFileEntry } from '../../../protocol/changes/types';
import { ErrorNotice } from '../../shared/ErrorNotice';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { ChangeSectionView } from './ChangeSectionView';
import { CommitComposer } from './CommitComposer';
import { EmptyState } from './EmptyState';
import { OperationBanner } from './OperationBanner';
import { StashList } from './StashList';
import { buildChangeSections, type ChangeListItem } from './changeTree';
import { getChangeCount, type ChangesState, type ChangesViewMode } from './changesState';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import type { CreateStashKind, StashEntryAction } from './stashCommands';

interface ChangesAppProps {
    readonly state: ChangesState;
    readonly onViewModeChange: (viewMode: ChangesViewMode) => void;
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
    onRowAction,
    onBulkAction,
    onCommit,
    onOperationAction,
    onCreateStash,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
}: ChangesAppProps) {
    const sections = useMemo(() => buildChangeSections(state.status), [state.status]);
    const changeCount = getChangeCount(state.status);

    return (
        <main className="changes-shell">
            <header className="changes-header">
                <div>
                    <h1>Changes</h1>
                    <p>{state.loading ? 'Loading repository state' : summaryText(changeCount)}</p>
                </div>
                <div className="segmented" role="group" aria-label="Changes view mode">
                    <button type="button" aria-pressed={state.viewMode === 'tree'} onClick={() => onViewModeChange('tree')}>Tree</button>
                    <button type="button" aria-pressed={state.viewMode === 'list'} onClick={() => onViewModeChange('list')}>List</button>
                </div>
            </header>

            {operationBannerFor(state.status.conflictState, state.status.conflicts.length, onOperationAction)}

            <ErrorNotice error={state.error} />

            <CommitComposer
                stagedCount={state.status.staged.length}
                conflictState={state.status.conflictState}
                feedback={state.commitFeedback}
                onCommit={onCommit}
            />

            <section className="changes-content" aria-label="Repository changes">
                {state.loading ? <EmptyState title="Loading changes" /> : null}
                {!state.loading && changeCount === 0 ? <EmptyState title="No changes" /> : null}
                {!state.loading && changeCount > 0 ? sections.map((section) => (
                    <ChangeSectionView
                        key={section.id}
                        section={section}
                        viewMode={state.viewMode}
                        onRowAction={onRowAction}
                        onBulkAction={onBulkAction}
                    />
                )) : null}
                {!state.loading ? (
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

function summaryText(count: number): string {
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
