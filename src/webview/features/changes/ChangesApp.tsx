import { useMemo } from 'react';
import { ConflictState, RepositoryState } from '../../../protocol/changes/types';
import type { ChangesSelectionContextTarget, CommitMode, StashFileEntry } from '../../../protocol/changes/types';
import { ErrorNotice } from '../../shared/ErrorNotice';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { ChangeSectionView } from './ChangeSectionView';
import { changesSelectionTarget, isChangeListItem } from './changeSelectionModel';
import { CommitComposer } from './CommitComposer';
import { EmptyState } from './EmptyState';
import { OperationBanner } from './OperationBanner';
import { StashList } from './StashList';
import { SubmoduleSection } from './SubmoduleSection';
import { buildChangeSections, ChangeSectionId, type ChangeListItem, type ChangeSection } from './changeTree';
import {
    ChangeSelectionMode,
    getChangeCount,
    type ChangesState,
} from './changesState';
import { filterAndSortSections, flattenedItems } from './changeViewModel';
import { changesSelectionContext } from './context-menu-model';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import { CreateStashKind, type StashEntryAction } from './stashCommands';
import { SubmoduleAction } from './submoduleCommands';

interface ChangesAppProps {
    readonly state: ChangesState;
    readonly onSectionToggle: (sectionId: ChangeSectionId) => void;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode, visibleItemIds: readonly string[]) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (action: ChangeBulkAction) => void;
    readonly onExplainSelection: (target: ChangesSelectionContextTarget) => void;
    readonly onSelectionContextTarget: (target: ChangesSelectionContextTarget) => void;
    readonly onCommit: (message: string, mode: CommitMode) => void;
    readonly onCommitComposerContextTarget: (message: string) => void;
    readonly onGenerateCommitMessage: () => void;
    readonly onOperationAction: (conflictState: ActiveConflictState, action: OperationAction) => void;
    readonly onCreateStash: (kind: CreateStashKind, message: string) => void;
    readonly onToggleStash: (index: number) => void;
    readonly onStashAction: (index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (index: number, file: StashFileEntry) => void;
    readonly onSubmoduleAction: (path: string, action: SubmoduleAction) => void;
    readonly onSubmoduleContextTarget: (path: string) => void;
    readonly onToggleSubmodule: (path: string) => void;
    readonly onSubmoduleRowAction: (submodulePath: string, item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onSubmoduleBulkAction: (submodulePath: string, action: ChangeBulkAction) => void;
    readonly onExplainSubmoduleChanges: (submodulePath: string) => void;
    readonly onExplainSubmoduleSelection: (target: ChangesSelectionContextTarget) => void;
    readonly onSubmoduleSelectionContextTarget: (target: ChangesSelectionContextTarget) => void;
    readonly onSubmoduleOperationAction: (submodulePath: string, conflictState: ActiveConflictState, action: OperationAction) => void;
    readonly onSubmoduleCommit: (submodulePath: string, message: string, mode: CommitMode) => void;
    readonly onSubmoduleCommitComposerContextTarget: (submodulePath: string, message: string) => void;
    readonly onGenerateCommitMessageForSubmodule: (submodulePath: string) => void;
    readonly onSubmoduleCreateStash: (submodulePath: string, message: string) => void;
    readonly onToggleSubmoduleStash: (submodulePath: string, index: number) => void;
    readonly onSubmoduleStashAction: (submodulePath: string, index: number, action: StashEntryAction) => void;
    readonly onSubmoduleStashFileDiff: (submodulePath: string, index: number, file: StashFileEntry) => void;
}

export function ChangesApp({
    state,
    onSectionToggle,
    onSelectItem,
    onRowAction,
    onBulkAction,
    onExplainSelection,
    onSelectionContextTarget,
    onCommit,
    onCommitComposerContextTarget,
    onGenerateCommitMessage,
    onOperationAction,
    onCreateStash,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
    onSubmoduleAction,
    onSubmoduleContextTarget,
    onToggleSubmodule,
    onSubmoduleRowAction,
    onSubmoduleBulkAction,
    onExplainSubmoduleChanges,
    onExplainSubmoduleSelection,
    onSubmoduleSelectionContextTarget,
    onSubmoduleOperationAction,
    onSubmoduleCommit,
    onSubmoduleCommitComposerContextTarget,
    onGenerateCommitMessageForSubmodule,
    onSubmoduleCreateStash,
    onToggleSubmoduleStash,
    onSubmoduleStashAction,
    onSubmoduleStashFileDiff,
}: ChangesAppProps) {
    const rawSections = useMemo(() => buildChangeSections(state.status), [state.status]);
    const sections = useMemo(
        () => filterAndSortSections(rawSections, state.pathFilter, state.sortMode),
        [rawSections, state.pathFilter, state.sortMode],
    );
    const visibleItems = useMemo(() => flattenedItems(sections), [sections]);
    const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
    const visibleItemsById = useMemo(() => new Map(visibleItems.map((item) => [item.id, item])), [visibleItems]);
    const selectedItemIds = useMemo(() => new Set(state.selectedItemIds), [state.selectedItemIds]);
    const changeCount = getChangeCount(state.status);
    const visibleChangeCount = visibleItemIds.length;
    const hasRepository = state.status.repositoryState !== RepositoryState.Missing;
    const selectionItemsFor = (item: ChangeListItem): readonly ChangeListItem[] => (
        selectedItemIds.has(item.id)
            ? state.selectedItemIds.map((id) => visibleItemsById.get(id)).filter(isChangeListItem)
            : [item]
    );
    const selectionTargetFor = (item: ChangeListItem) => changesSelectionTarget(selectionItemsFor(item));
    const contextForItem = (item: ChangeListItem) => {
        const target = selectionTargetFor(item);
        return changesSelectionContext({
            canStage: target.stageFilePaths.length > 0,
            canUnstage: target.unstageFilePaths.length > 0,
            canStash: target.stashFilePaths.length > 0,
            canExplainDiff: hasPatchableSelection(target),
            canCreatePatch: hasPatchableSelection(target),
            canDiscard: target.discardFilePaths.length > 0,
        });
    };
    const openSelectionContext = (item: ChangeListItem) => {
        if (!selectedItemIds.has(item.id)) {
            onSelectItem(item, ChangeSelectionMode.Replace, visibleItemIds);
        }
        onSelectionContextTarget(selectionTargetFor(item));
    };

    return (
        <main className="changes-shell">
            <ErrorNotice error={state.error} />

            {!state.loading && hasRepository ? operationBannerFor(state.status.conflictState, state.status.conflicts.length, onOperationAction) : null}

            {!state.loading && hasRepository ? (
                <CommitComposer
                    stagedCount={state.status.staged.length}
                    conflictState={state.status.conflictState}
                    feedback={state.commitFeedback}
                    focusRequest={state.commitFocusRequest}
                    generatingMessage={state.commitMessageGenerationRequestId !== undefined}
                    generatedMessage={state.generatedCommitMessage}
                    generationError={state.commitMessageGenerationError}
                    targetLabel={state.status.currentBranch}
                    onGenerateMessage={onGenerateCommitMessage}
                    onCommit={onCommit}
                    onOpenNativeMenu={(message) => onCommitComposerContextTarget(message)}
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
                        sortMode={state.sortMode}
                        collapsed={state.collapsedSectionIds.includes(section.id)}
                        selectedItemIds={selectedItemIds}
                        contextForItem={contextForItem}
                        onToggleCollapsed={() => onSectionToggle(section.id)}
                        onSelectItem={(item, mode) => onSelectItem(item, mode, visibleItemIds)}
                        onOpenSelectionContext={openSelectionContext}
                        onRowAction={onRowAction}
                        onBulkAction={onBulkAction}
                        onReview={reviewHandlerFor(section, (target) => onExplainSelection(target))}
                        onStash={stashHandlerFor(section.id, onCreateStash)}
                        stashTitle={stashTitleFor(section.id)}
                    />
                )) : null}
                {!state.loading && hasRepository && state.status.submodules.length > 0 ? (
                    <SubmoduleSection
                        submodules={state.status.submodules}
                        expandedPaths={state.expandedSubmodulePaths}
                        statusByPath={state.submoduleStatusByPath}
                        expandedStashKeys={state.expandedSubmoduleStashKeys}
                        stashFilesByKey={state.submoduleStashFilesByKey}
                        commitFeedbackByPath={state.submoduleCommitFeedbackByPath}
                        commitMessageGenerationRequestIdByPath={state.submoduleCommitMessageGenerationRequestIdByPath}
                        generatedCommitMessageByPath={state.generatedSubmoduleCommitMessageByPath}
                        commitMessageGenerationErrorByPath={state.submoduleCommitMessageGenerationErrorByPath}
                        loadingStatusPaths={state.loadingSubmoduleStatusPaths}
                        commitFocusRequestByPath={state.submoduleCommitFocusRequestByPath}
                        onToggle={onToggleSubmodule}
                        onContextTarget={onSubmoduleContextTarget}
                        onAction={onSubmoduleAction}
                        onUpdateAll={() => onSubmoduleAction('', SubmoduleAction.UpdateAll)}
                        onReviewChanges={onExplainSubmoduleChanges}
                        onRowAction={onSubmoduleRowAction}
                        onBulkAction={onSubmoduleBulkAction}
                        onExplainSelection={onExplainSubmoduleSelection}
                        onSelectionContextTarget={onSubmoduleSelectionContextTarget}
                        onOperationAction={onSubmoduleOperationAction}
                        onCommit={onSubmoduleCommit}
                        onCommitComposerContextTarget={onSubmoduleCommitComposerContextTarget}
                        onGenerateCommitMessage={onGenerateCommitMessageForSubmodule}
                        onCreateStash={onSubmoduleCreateStash}
                        onToggleStash={onToggleSubmoduleStash}
                        onStashAction={onSubmoduleStashAction}
                        onStashFileDiff={onSubmoduleStashFileDiff}
                    />
                ) : null}
                {!state.loading && hasRepository && state.status.stashes.length > 0 ? (
                    <StashList
                        stashes={state.status.stashes}
                        expandedIndexes={state.expandedStashIndexes}
                        filesByIndex={state.stashFilesByIndex}
                        onToggleStash={onToggleStash}
                        onStashAction={onStashAction}
                        onStashFileDiff={onStashFileDiff}
                    />
                ) : null}
            </section>
        </main>
    );
}

function hasPatchableSelection(target: ReturnType<typeof changesSelectionTarget>): boolean {
    return target.patchStagedFilePaths.length > 0
        || target.patchUnstagedFilePaths.length > 0
        || target.patchUntrackedFilePaths.length > 0;
}

function reviewHandlerFor(
    section: ChangeSection,
    onExplainSelection: (target: ChangesSelectionContextTarget) => void,
): ((section: ChangeSection) => void) | undefined {
    const target = changesSelectionTarget(section.items);
    return hasPatchableSelection(target)
        ? () => onExplainSelection(target)
        : undefined;
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

function stashHandlerFor(
    sectionId: ChangeSectionId,
    onCreateStash: (kind: CreateStashKind, message: string) => void,
): ((message: string) => void) | undefined {
    if (sectionId === ChangeSectionId.Unstaged) {
        return (message) => onCreateStash(CreateStashKind.All, message);
    }
    if (sectionId === ChangeSectionId.Staged) {
        return (message) => onCreateStash(CreateStashKind.Staged, message);
    }
    return undefined;
}

function stashTitleFor(sectionId: ChangeSectionId): string | undefined {
    if (sectionId === ChangeSectionId.Staged) { return 'Stash staged changes'; }
    if (sectionId === ChangeSectionId.Unstaged) { return 'Stash changes'; }
    return undefined;
}
