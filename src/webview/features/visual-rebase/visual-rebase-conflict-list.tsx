import type { VisualRebaseConflictFile } from '@protocol/visual-rebase/types';
import type { ReactNode } from 'react';
import { SharedChangeRow, type SharedChangeRowItem } from '@webview/shared/change-row';
import { ChangeRowAction, type ChangeActionDescriptor } from '@webview/shared/change-row-actions';

interface VisualRebaseConflictListProps {
    readonly conflictFiles: readonly VisualRebaseConflictFile[];
    readonly running: boolean;
    readonly onOpenMergeEditor: (filePath: string) => void;
    readonly onOpenFile: (filePath: string) => void;
    readonly onMarkResolved: (filePath: string) => void;
    readonly onAcceptCurrent: (filePath: string) => void;
    readonly onAcceptIncoming: (filePath: string) => void;
}

export function VisualRebaseConflictList({
    conflictFiles,
    running,
    onOpenMergeEditor,
    onOpenFile,
    onMarkResolved,
    onAcceptCurrent,
    onAcceptIncoming,
}: VisualRebaseConflictListProps) {
    const unmergedItems = conflictFiles.filter((file) => file.state === 'unmerged').map(toConflictItem);
    const mergedItems = conflictFiles.filter((file) => file.state === 'merged').map(toConflictItem);
    const conflictCount = unmergedItems.length;
    const totalCount = conflictFiles.length;
    return (
        <section className="visual-rebase-conflicts" aria-label="Rebase conflict actions">
            <div className="visual-rebase-conflict-heading">
                <div>
                    <strong>Resolve conflicts</strong>
                    <span>{statusText(conflictCount, mergedItems.length)}</span>
                </div>
                <span className="visual-rebase-conflict-badge">{totalCount}</span>
            </div>
            <div className="visual-rebase-conflict-list">
                {unmergedItems.length > 0 ? (
                    <ConflictGroup title="Unmerged Changes" count={unmergedItems.length}>
                        {unmergedItems.map((item) => (
                            <SharedChangeRow
                                key={item.id}
                                item={item}
                                depth={0}
                                selected={false}
                                context="{}"
                                actions={conflictActions(running, false)}
                                primaryAction={running ? undefined : ChangeRowAction.OpenMergeEditor}
                                alwaysShowActions
                                onSelect={() => {}}
                                onOpenContextMenu={() => {}}
                                onAction={(_, action) => runAction(item.entry.filePath, action, {
                                    onOpenMergeEditor,
                                    onOpenFile,
                                    onMarkResolved,
                                    onAcceptCurrent,
                                    onAcceptIncoming,
                                })}
                            />
                        ))}
                    </ConflictGroup>
                ) : null}
                {mergedItems.length > 0 ? (
                    <ConflictGroup title="Merged, Not Marked Resolved" count={mergedItems.length}>
                        {mergedItems.map((item) => (
                            <SharedChangeRow
                                key={item.id}
                                item={item}
                                depth={0}
                                selected={false}
                                context="{}"
                                actions={conflictActions(running, true)}
                                primaryAction={running ? undefined : ChangeRowAction.MarkResolved}
                                alwaysShowActions
                                onSelect={() => {}}
                                onOpenContextMenu={() => {}}
                                onAction={(_, action) => runAction(item.entry.filePath, action, {
                                    onOpenMergeEditor,
                                    onOpenFile,
                                    onMarkResolved,
                                    onAcceptCurrent,
                                    onAcceptIncoming,
                                })}
                            />
                        ))}
                    </ConflictGroup>
                ) : null}
            </div>
        </section>
    );
}

interface ConflictGroupProps {
    readonly title: string;
    readonly count: number;
    readonly children: ReactNode;
}

function ConflictGroup({ title, count, children }: ConflictGroupProps) {
    return (
        <section className="visual-rebase-conflict-group" aria-label={title}>
            <div className="visual-rebase-conflict-section-heading">
                <h3>{title}</h3>
                <span>{count === 1 ? '1 file' : `${count} files`}</span>
            </div>
            {children}
        </section>
    );
}

interface RebaseConflictHandlers {
    readonly onOpenMergeEditor: (filePath: string) => void;
    readonly onOpenFile: (filePath: string) => void;
    readonly onMarkResolved: (filePath: string) => void;
    readonly onAcceptCurrent: (filePath: string) => void;
    readonly onAcceptIncoming: (filePath: string) => void;
}

function runAction(filePath: string, action: ChangeRowAction, handlers: RebaseConflictHandlers): void {
    switch (action) {
        case ChangeRowAction.OpenMergeEditor:
            handlers.onOpenMergeEditor(filePath);
            return;
        case ChangeRowAction.Open:
            handlers.onOpenFile(filePath);
            return;
        case ChangeRowAction.MarkResolved:
            handlers.onMarkResolved(filePath);
            return;
        case ChangeRowAction.AcceptOurs:
            handlers.onAcceptCurrent(filePath);
            return;
        case ChangeRowAction.AcceptTheirs:
            handlers.onAcceptIncoming(filePath);
            return;
        default:
            return;
    }
}

function conflictActions(
    running: boolean,
    merged: boolean,
): readonly ChangeActionDescriptor<ChangeRowAction>[] {
    const actions = merged ? MERGED_CONFLICT_ACTIONS : UNMERGED_CONFLICT_ACTIONS;
    return running ? [] : actions;
}

type RebaseConflictItem = SharedChangeRowItem;

const UNMERGED_CONFLICT_ACTIONS: readonly ChangeActionDescriptor<ChangeRowAction>[] = [
    { action: ChangeRowAction.OpenMergeEditor, icon: 'git-merge', label: 'Merge', title: 'Open merge editor' },
    { action: ChangeRowAction.AcceptOurs, icon: 'fold-up', label: 'Ours', title: 'Accept current changes (ours)' },
    { action: ChangeRowAction.AcceptTheirs, icon: 'fold-down', label: 'Theirs', title: 'Accept incoming changes (theirs)' },
    { action: ChangeRowAction.MarkResolved, icon: 'check', label: 'Resolved', title: 'Mark resolved' },
    { action: ChangeRowAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open file' },
];

const MERGED_CONFLICT_ACTIONS: readonly ChangeActionDescriptor<ChangeRowAction>[] = [
    { action: ChangeRowAction.MarkResolved, icon: 'check', label: 'Resolved', title: 'Mark resolved' },
    { action: ChangeRowAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open file' },
];

function toConflictItem(file: VisualRebaseConflictFile): RebaseConflictItem {
    return {
        id: `visual-rebase-conflict:${file.filePath}:${file.origPath ?? ''}`,
        entry: {
            filePath: file.filePath,
            indexStatus: file.indexStatus,
            workTreeStatus: file.workTreeStatus,
            ...(file.origPath ? { origPath: file.origPath } : {}),
        },
    };
}

function statusText(unmergedCount: number, mergedCount: number): string {
    if (unmergedCount > 0) {
        return unmergedCount === 1 ? '1 conflict remaining' : `${unmergedCount} conflicts remaining`;
    }
    if (mergedCount > 0) {
        return mergedCount === 1 ? '1 file ready to mark resolved' : `${mergedCount} files ready to mark resolved`;
    }
    return 'All conflicts resolved';
}
