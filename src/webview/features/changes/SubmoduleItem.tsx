import { useState, type MouseEvent } from 'react';
import { SubmoduleStatus } from '../../../protocol/shared/repo';
import type { StashFileEntry, SubmoduleEntry, SubmoduleStatusData } from '../../../protocol/changes/types';
import { ConflictState } from '../../../protocol/changes/types';
import type { CommitMode } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import { Codicon } from '../../shared/Codicon';
import { IconButton } from '../../shared/IconButton';
import { SubmoduleAction } from './submoduleCommands';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { ChangeSectionView } from './ChangeSectionView';
import type { ChangeListItem, ChangeSection } from './changeTree';
import { ChangeSectionId } from './changeTree';
import { ChangeSelectionMode, ChangesSortMode, ChangesViewMode, type CommitFeedback, type GeneratedCommitMessage } from './changesState';
import { CommitComposer } from './CommitComposer';
import { changesItemContext, changesSubmoduleToolbarContext } from './context-menu-model';
import { OperationBanner } from './OperationBanner';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import { StashList } from './StashList';
import type { StashEntryAction } from './stashCommands';

interface SubmoduleItemProps {
    readonly submodule: SubmoduleEntry;
    readonly expanded: boolean;
    readonly statusData: SubmoduleStatusData | undefined;
    readonly loadingStatus: boolean;
    readonly focusRequest: number;
    readonly onToggle: () => void;
    readonly onOpenContextMenu: () => void;
    readonly onAction: (action: SubmoduleAction) => void;
    readonly expandedStashIndexes: readonly number[];
    readonly stashFilesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (action: ChangeBulkAction) => void;
    readonly onOperationAction: (conflictState: ActiveConflictState, action: OperationAction) => void;
    readonly commitFeedback: CommitFeedback | undefined;
    readonly commitMessageGenerating: boolean;
    readonly generatedCommitMessage: GeneratedCommitMessage | undefined;
    readonly commitMessageGenerationError: ProtocolError | undefined;
    readonly onCommit: (message: string, mode: CommitMode) => void;
    readonly onCommitComposerContextTarget: (message: string) => void;
    readonly onGenerateCommitMessage: () => void;
    readonly onCreateStash: (message: string) => void;
    readonly onToggleStash: (index: number) => void;
    readonly onStashAction: (index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (index: number, file: StashFileEntry) => void;
}

const BADGE_LABELS: Partial<Record<SubmoduleStatus, string>> = {
    [SubmoduleStatus.Dirty]: 'dirty',
    [SubmoduleStatus.OutOfSync]: 'out-of-sync',
    [SubmoduleStatus.NotInitialized]: 'not initialized',
};

export function SubmoduleItem({
    submodule,
    expanded,
    statusData,
    loadingStatus,
    focusRequest,
    onToggle,
    onOpenContextMenu,
    onAction,
    expandedStashIndexes,
    stashFilesByIndex,
    onRowAction,
    onBulkAction,
    onOperationAction,
    commitFeedback,
    commitMessageGenerating,
    generatedCommitMessage,
    commitMessageGenerationError,
    onCommit,
    onCommitComposerContextTarget,
    onGenerateCommitMessage,
    onCreateStash,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
}: SubmoduleItemProps) {
    const [collapsedSectionIds, setCollapsedSectionIds] = useState<readonly ChangeSectionId[]>([]);
    const needsAction = submodule.status !== SubmoduleStatus.Clean;
    const sections = statusData ? buildSubmoduleSections(statusData) : [];
    const visibleItemIds = sections.flatMap((section) => section.items.map((item) => item.id));
    const showCommitComposer = statusData
        ? statusData.staged.length > 0
            || focusRequest > 0
            || commitFeedback !== undefined
            || commitMessageGenerating
            || generatedCommitMessage !== undefined
            || commitMessageGenerationError !== undefined
        : false;
    const hasVisibleDetails = showCommitComposer || visibleItemIds.length > 0 || (statusData?.stashes.length ?? 0) > 0;
    return (
        <article className="submodule-item">
            <header className="submodule-item-header" data-vscode-context={changesItemContext()}>
                <button
                    type="button"
                    className="stash-toggle"
                    title={expanded ? 'Hide changes' : 'Show changes'}
                    aria-label={expanded ? 'Hide changes' : 'Show changes'}
                    aria-expanded={expanded}
                    onClick={onToggle}
                >
                    <Codicon name={expanded ? 'chevron-down' : 'chevron-right'} />
                </button>
                <i className="codicon codicon-source-control submodule-icon" aria-hidden="true" />
                <div className="submodule-title">
                    <span className="submodule-name">{submodule.name}</span>
                    <span className="submodule-path">{submodule.path}</span>
                </div>
                {needsAction ? (
                    <span className={`submodule-badge submodule-badge-${submodule.status}`}>
                        {BADGE_LABELS[submodule.status]}
                    </span>
                ) : null}
                <div className="submodule-actions">
                    <IconButton
                        icon="refresh"
                        title="Refresh submodule changes"
                        busy={loadingStatus}
                        onClick={() => onAction(SubmoduleAction.Refresh)}
                    />
                    <IconButton
                        icon="repo-pull"
                        title="Pull submodule"
                        onClick={() => onAction(SubmoduleAction.Pull)}
                    />
                    <IconButton
                        icon="repo-push"
                        title="Push submodule"
                        onClick={() => onAction(SubmoduleAction.Push)}
                    />
                    {needsAction ? (
                        <IconButton
                            icon="arrow-down"
                            title={submodule.status === SubmoduleStatus.NotInitialized ? 'Initialize submodule' : 'Update submodule'}
                            onClick={() => onAction(SubmoduleAction.Update)}
                        />
                    ) : null}
                    <IconButton
                        icon="link-external"
                        title="Open submodule"
                        onClick={() => onAction(SubmoduleAction.Open)}
                    />
                    <button
                        type="button"
                        className="icon-button"
                        title="More submodule actions"
                        aria-label="More submodule actions"
                        data-vscode-context={changesSubmoduleToolbarContext()}
                        onContextMenu={onOpenContextMenu}
                        onClick={(event) => openNativeContextMenu(event, onOpenContextMenu)}
                    >
                        <i className="codicon codicon-ellipsis" aria-hidden="true" />
                    </button>
                </div>
            </header>
            {expanded ? (
                <div className="submodule-files">
                    {!statusData ? (
                        <p className="stash-placeholder">Loading changes…</p>
                    ) : (
                        <div className="submodule-change-areas">
                            {operationBannerFor(statusData.conflictState, statusData.conflicts.length, onOperationAction)}
                            {showCommitComposer ? (
                                <CommitComposer
                                    stagedCount={statusData.staged.length}
                                    conflictState={commitConflictState(statusData)}
                                    feedback={commitFeedback}
                                    focusRequest={focusRequest}
                                    generatingMessage={commitMessageGenerating}
                                    generatedMessage={generatedCommitMessage}
                                    generationError={commitMessageGenerationError}
                                    targetLabel={statusData.currentBranch ?? submodule.name}
                                    submodulePath={submodule.path}
                                    onGenerateMessage={onGenerateCommitMessage}
                                    onCommit={onCommit}
                                    onOpenNativeMenu={(message) => onCommitComposerContextTarget(message)}
                                />
                            ) : null}
                            {sections.map((section) => (
                                <ChangeSectionView
                                    key={section.id}
                                    section={section}
                                    viewMode={ChangesViewMode.List}
                                    sortMode={ChangesSortMode.Path}
                                    collapsed={collapsedSectionIds.includes(section.id)}
                                    selectedItemIds={new Set()}
                                    onToggleCollapsed={() => setCollapsedSectionIds((ids) => toggleSectionId(ids, section.id))}
                                    onSelectItem={noopSelect}
                                    onRowAction={onRowAction}
                                    onBulkAction={onBulkAction}
                                    onStash={section.id === ChangeSectionId.Unstaged ? onCreateStash : undefined}
                                />
                            ))}
                            <StashList
                                title="Stashed"
                                stashes={statusData.stashes}
                                expandedIndexes={expandedStashIndexes}
                                filesByIndex={stashFilesByIndex}
                                onToggleStash={onToggleStash}
                                onStashAction={onStashAction}
                                onStashFileDiff={onStashFileDiff}
                            />
                            {!hasVisibleDetails ? (
                                <p className="stash-placeholder">No changes inside submodule</p>
                            ) : null}
                        </div>
                    )}
                </div>
            ) : null}
        </article>
    );
}

function noopSelect(_item: ChangeListItem, _mode: ChangeSelectionMode): void {}

function openNativeContextMenu(event: MouseEvent<HTMLButtonElement>, onOpenContextMenu: () => void): void {
    onOpenContextMenu();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.right,
        clientY: rect.bottom,
    }));
}

function toggleSectionId(sectionIds: readonly ChangeSectionId[], sectionId: ChangeSectionId): readonly ChangeSectionId[] {
    return sectionIds.includes(sectionId)
        ? sectionIds.filter((id) => id !== sectionId)
        : [...sectionIds, sectionId];
}

function buildSubmoduleSections(statusData: SubmoduleStatusData): readonly ChangeSection[] {
    return [
        {
            id: ChangeSectionId.Conflicts,
            title: 'Conflicts',
            items: statusData.conflicts.map((entry) => toItem(ChangeSectionId.Conflicts, entry, false)),
        },
        {
            id: ChangeSectionId.Staged,
            title: 'Staged',
            items: statusData.staged.map((entry) => toItem(ChangeSectionId.Staged, entry, true)),
        },
        {
            id: ChangeSectionId.Unstaged,
            title: 'Changes',
            items: statusData.unstaged.map((entry) => toItem(ChangeSectionId.Unstaged, entry, false)),
        },
    ].filter((section) => section.items.length > 0);
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

function commitConflictState(statusData: SubmoduleStatusData): ConflictState {
    return statusData.conflictState === ConflictState.None && statusData.conflicts.length > 0
        ? ConflictState.Merge
        : statusData.conflictState;
}

function toItem(
    section: ChangeSectionId,
    entry: SubmoduleStatusData['staged'][number],
    isStaged: boolean,
): ChangeListItem {
    return {
        id: `submodule-expand:${String(section)}:${entry.filePath}`,
        section,
        entry,
        isStaged,
    };
}
