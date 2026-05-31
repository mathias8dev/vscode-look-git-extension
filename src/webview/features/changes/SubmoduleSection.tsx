import { useState } from 'react';
import type { CommitMode } from '../../../protocol/changes/types';
import type { StashFileEntry, SubmoduleEntry, SubmoduleStatusData } from '../../../protocol/changes/types';
import { Codicon } from '../../shared/Codicon';
import { IconButton } from '../../shared/IconButton';
import type { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import type { ChangeListItem } from './changeTree';
import { submoduleStashKey, type CommitFeedback } from './changesState';
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
    readonly onToggle: (path: string) => void;
    readonly onAction: (path: string, action: SubmoduleAction) => void;
    readonly onUpdateAll: () => void;
    readonly onRowAction: (submodulePath: string, item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (submodulePath: string, action: ChangeBulkAction) => void;
    readonly onCommit: (submodulePath: string, message: string, mode: CommitMode) => void;
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
    onToggle,
    onAction,
    onUpdateAll,
    onRowAction,
    onBulkAction,
    onCommit,
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
                                onToggle={() => onToggle(submodule.path)}
                                onAction={(action) => onAction(submodule.path, action)}
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
                                commitFeedback={commitFeedbackByPath[submodule.path]}
                                onCommit={(message, mode) => onCommit(submodule.path, message, mode)}
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
