import { useState } from 'react';
import type { ChangesSelectionContextTarget, CommitMode } from '../../../protocol/changes/types';
import type { StashFileEntry, SubmoduleEntry, SubmoduleStatusData } from '../../../protocol/changes/types';
import { Codicon } from '../../shared/Codicon';
import { IconButton } from '../../shared/IconButton';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import type { ChangeListItem } from './changeTree';
import { submoduleStashKey, type CommitFeedback, type GeneratedCommitMessage } from './changesState';
import type { ProtocolError } from '../../../protocol/shared/base';
import type { ActiveConflictState, OperationAction } from './operationCommands';
import { SubmoduleAction } from './submoduleCommands';
import { SubmoduleItem } from './SubmoduleItem';
import type { StashEntryAction } from './stashCommands';

interface SubmoduleSectionProps {
    readonly submodules: readonly SubmoduleEntry[];
    readonly expandedPaths: readonly string[];
    readonly statusByPath: Readonly<Record<string, SubmoduleStatusData>>;
    readonly expandedStashKeys: readonly string[];
    readonly stashFilesByKey: Readonly<Record<string, readonly StashFileEntry[]>>;
    readonly commitFeedbackByPath: Readonly<Record<string, CommitFeedback>>;
    readonly commitMessageGenerationRequestIdByPath: Readonly<Record<string, string>>;
    readonly generatedCommitMessageByPath: Readonly<Record<string, GeneratedCommitMessage>>;
    readonly commitMessageGenerationErrorByPath: Readonly<Record<string, ProtocolError>>;
    readonly loadingStatusPaths: readonly string[];
    readonly commitFocusRequestByPath: Readonly<Record<string, number>>;
    readonly onToggle: (path: string) => void;
    readonly onContextTarget: (path: string) => void;
    readonly onAction: (path: string, action: SubmoduleAction) => void;
    readonly onUpdateAll: () => void;
    readonly onReviewChanges: (submodulePath: string) => void;
    readonly onRowAction: (submodulePath: string, item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (submodulePath: string, action: ChangeBulkAction) => void;
    readonly onExplainSelection: (target: ChangesSelectionContextTarget) => void;
    readonly onSelectionContextTarget: (target: ChangesSelectionContextTarget) => void;
    readonly onOperationAction: (submodulePath: string, conflictState: ActiveConflictState, action: OperationAction) => void;
    readonly onCommit: (submodulePath: string, message: string, mode: CommitMode) => void;
    readonly onCommitComposerContextTarget: (submodulePath: string, message: string) => void;
    readonly onGenerateCommitMessage: (submodulePath: string) => void;
    readonly onCreateStash: (submodulePath: string, message: string) => void;
    readonly onToggleStash: (submodulePath: string, index: number) => void;
    readonly onStashAction: (submodulePath: string, index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (submodulePath: string, index: number, file: StashFileEntry) => void;
}

export function SubmoduleSection({
    submodules,
    expandedPaths,
    statusByPath,
    expandedStashKeys,
    stashFilesByKey,
    commitFeedbackByPath,
    commitMessageGenerationRequestIdByPath,
    generatedCommitMessageByPath,
    commitMessageGenerationErrorByPath,
    loadingStatusPaths,
    commitFocusRequestByPath,
    onToggle,
    onContextTarget,
    onAction,
    onUpdateAll,
    onReviewChanges,
    onRowAction,
    onBulkAction,
    onExplainSelection,
    onSelectionContextTarget,
    onOperationAction,
    onCommit,
    onCommitComposerContextTarget,
    onGenerateCommitMessage,
    onCreateStash,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
}: SubmoduleSectionProps) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <section className="submodule-panel" aria-label="Submodules">
            <header className="submodule-panel-header">
                <button
                    type="button"
                    className="stash-toggle"
                    aria-expanded={!collapsed}
                    title={collapsed ? 'Expand submodules' : 'Collapse submodules'}
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <Codicon name={collapsed ? 'chevron-right' : 'chevron-down'} />
                </button>
                <h2>Submodules</h2>
                <div className="submodule-header-actions">
                    <IconButton
                        icon="repo-sync"
                        title="Update all submodules"
                        onClick={onUpdateAll}
                    />
                </div>
                <span>{submodules.length}</span>
            </header>
            {!collapsed ? (
                <div className="submodule-list">
                    {submodules.map((submodule) => {
                        const stashEntries = statusByPath[submodule.path]?.stashes ?? [];
                        return (
                            <SubmoduleItem
                                key={submodule.path}
                                submodule={submodule}
                                expanded={expandedPaths.includes(submodule.path)}
                                statusData={statusByPath[submodule.path]}
                                loadingStatus={loadingStatusPaths.includes(submodule.path)}
                                focusRequest={commitFocusRequestByPath[submodule.path] ?? 0}
                                onToggle={() => onToggle(submodule.path)}
                                onOpenContextMenu={() => onContextTarget(submodule.path)}
                                onAction={(action) => onAction(submodule.path, action)}
                                onReviewChanges={() => onReviewChanges(submodule.path)}
                                expandedStashIndexes={stashEntries
                                    .map((stash) => stash.index)
                                    .filter((index) => expandedStashKeys.includes(submoduleStashKey(submodule.path, index)))}
                                stashFilesByIndex={stashEntries.reduce<Record<number, readonly StashFileEntry[]>>((acc, stash) => {
                                    const files = stashFilesByKey[submoduleStashKey(submodule.path, stash.index)];
                                    if (files) { acc[stash.index] = files; }
                                    return acc;
                                }, {})}
                                onRowAction={(item, action) => onRowAction(submodule.path, item, action)}
                                onBulkAction={(action) => onBulkAction(submodule.path, action)}
                                onExplainSelection={onExplainSelection}
                                onSelectionContextTarget={onSelectionContextTarget}
                                onOperationAction={(conflictState, action) => onOperationAction(submodule.path, conflictState, action)}
                                commitFeedback={commitFeedbackByPath[submodule.path]}
                                commitMessageGenerating={commitMessageGenerationRequestIdByPath[submodule.path] !== undefined}
                                generatedCommitMessage={generatedCommitMessageByPath[submodule.path]}
                                commitMessageGenerationError={commitMessageGenerationErrorByPath[submodule.path]}
                                onCommit={(message, mode) => onCommit(submodule.path, message, mode)}
                                onCommitComposerContextTarget={(message) => onCommitComposerContextTarget(submodule.path, message)}
                                onGenerateCommitMessage={() => onGenerateCommitMessage(submodule.path)}
                                onCreateStash={(message) => onCreateStash(submodule.path, message)}
                                onToggleStash={(index) => onToggleStash(submodule.path, index)}
                                onStashAction={(index, action) => onStashAction(submodule.path, index, action)}
                                onStashFileDiff={(index, file) => onStashFileDiff(submodule.path, index, file)}
                            />
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}
