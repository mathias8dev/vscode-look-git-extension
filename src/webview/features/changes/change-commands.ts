import type { ChangesToolbarCommand, ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import type { ChangesSelectionContextTarget } from '@protocol/changes/types';
import { ChangeRowAction, type ChangeActionDescriptor } from '@webview/shared/change-row-actions';
import { ChangeSectionId, type ChangeListItem, type ChangeSection } from '@webview/features/changes/change-tree';

export { ChangeRowAction };
export type { ChangeActionDescriptor };

export enum ChangeBulkAction {
    StageAll = 'stageAll',
    UnstageAll = 'unstageAll',
    DiscardAll = 'discardAll',
    OpenAllMergeEditors = 'openAllMergeEditors',
    AcceptAllTheirs = 'acceptAllTheirs',
}

export function rowActionsFor(item: ChangeListItem): readonly ChangeActionDescriptor<ChangeRowAction>[] {
    if (item.section === ChangeSectionId.Staged) {
        if (item.entry.isSubmodule) {
            return [
                { action: ChangeRowAction.Diff, icon: 'diff', label: 'Diff', title: 'Open submodule gitlink diff' },
                { action: ChangeRowAction.Unstage, icon: 'remove', label: 'Unstage', title: 'Unstage submodule gitlink' },
                { action: ChangeRowAction.Open, icon: 'folder-opened', label: 'Open', title: 'Open submodule' },
            ];
        }
        return [
            { action: ChangeRowAction.Diff, icon: 'diff', label: 'Diff', title: 'Open diff' },
            { action: ChangeRowAction.Unstage, icon: 'remove', label: 'Unstage', title: 'Unstage file' },
            { action: ChangeRowAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open file' },
        ];
    }

    if (item.entry.isSubmodule) {
        if (item.section === ChangeSectionId.Conflicts) {
            return [
                { action: ChangeRowAction.Diff, icon: 'diff', label: 'Diff', title: 'Open submodule gitlink diff' },
                { action: ChangeRowAction.MarkResolved, icon: 'check', label: 'Resolved', title: 'Mark resolved' },
                { action: ChangeRowAction.Open, icon: 'folder-opened', label: 'Open', title: 'Open submodule' },
            ];
        }
        return [
            { action: ChangeRowAction.Diff, icon: 'diff', label: 'Diff', title: 'Open submodule gitlink diff' },
            { action: ChangeRowAction.Stage, icon: 'add', label: 'Stage', title: 'Stage submodule gitlink' },
            { action: ChangeRowAction.Open, icon: 'folder-opened', label: 'Open', title: 'Open submodule' },
        ];
    }

    if (item.section === ChangeSectionId.Conflicts) {
        return [
            { action: ChangeRowAction.OpenMergeEditor, icon: 'git-merge', label: 'Merge', title: 'Open merge editor' },
            { action: ChangeRowAction.AcceptOurs, icon: 'fold-up', label: 'Ours', title: 'Accept current changes (ours)' },
            { action: ChangeRowAction.AcceptTheirs, icon: 'fold-down', label: 'Theirs', title: 'Accept incoming changes (theirs)' },
            { action: ChangeRowAction.MarkResolved, icon: 'check', label: 'Resolved', title: 'Mark resolved' },
            { action: ChangeRowAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open file' },
        ];
    }

    return [
        { action: ChangeRowAction.Diff, icon: 'diff', label: 'Diff', title: 'Open diff' },
        { action: ChangeRowAction.Stage, icon: 'add', label: 'Stage', title: 'Stage file' },
        { action: ChangeRowAction.Discard, icon: 'discard', label: 'Discard', title: 'Discard changes' },
        { action: ChangeRowAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open file' },
    ];
}

export function primaryRowActionFor(item: ChangeListItem): ChangeRowAction | undefined {
    if (item.entry.isSubmodule) { return ChangeRowAction.Diff; }
    return item.section === ChangeSectionId.Conflicts
        ? ChangeRowAction.OpenMergeEditor
        : ChangeRowAction.Diff;
}

export function bulkActionsFor(section: ChangeSection): readonly ChangeActionDescriptor<ChangeBulkAction>[] {
    if (section.id === ChangeSectionId.Staged) {
        return section.items.length > 0
            ? [{ action: ChangeBulkAction.UnstageAll, icon: 'remove', label: 'Unstage All', title: 'Unstage all staged files' }]
            : [];
    }
    if (section.id === ChangeSectionId.Unstaged) {
        return section.items.length > 0
            ? [
                { action: ChangeBulkAction.StageAll, icon: 'add', label: 'Stage All', title: 'Stage all changed files' },
                { action: ChangeBulkAction.DiscardAll, icon: 'discard', label: 'Discard All', title: 'Discard all unstaged changes' },
            ]
            : [];
    }
    if (section.id === ChangeSectionId.Conflicts) {
        if (section.items.length === 0) { return []; }
        const actions: ChangeActionDescriptor<ChangeBulkAction>[] = [];
        if (section.items.some((item) => !item.entry.isSubmodule)) {
            actions.push({ action: ChangeBulkAction.OpenAllMergeEditors, icon: 'git-merge', label: 'Open All', title: 'Open all conflicts in the merge editor' });
        }
        actions.push({ action: ChangeBulkAction.AcceptAllTheirs, icon: 'fold-down', label: 'Accept All Theirs', title: 'Accept incoming for all conflicts' });
        return actions;
    }
    return [];
}

export function messageForRowAction(item: ChangeListItem, action: ChangeRowAction): ChangesWebviewToExtensionMessage {
    const entry = item.entry;
    switch (action) {
        case ChangeRowAction.Open:
            return entry.isSubmodule
                ? { type: 'changes/openSubmodule', filePath: entry.filePath }
                : { type: 'changes/openFile', filePath: entry.filePath };
        case ChangeRowAction.Diff:
            return {
                type: 'changes/openDiff',
                filePath: entry.filePath,
                origPath: entry.origPath,
                isSubmodule: entry.isSubmodule,
                isStaged: item.isStaged,
                indexStatus: entry.indexStatus,
                workTreeStatus: entry.workTreeStatus,
            };
        case ChangeRowAction.Stage:
            return { type: 'changes/stageFile', filePath: entry.filePath };
        case ChangeRowAction.Unstage:
            return { type: 'changes/unstageFile', filePath: entry.filePath };
        case ChangeRowAction.Discard:
            return { type: 'changes/discardFile', filePath: entry.filePath };
        case ChangeRowAction.OpenMergeEditor:
            return { type: 'changes/openMergeEditor', filePath: entry.filePath };
        case ChangeRowAction.MarkResolved:
            return { type: 'changes/markResolved', filePath: entry.filePath };
        case ChangeRowAction.AcceptOurs:
            return { type: 'changes/acceptOurs', filePath: entry.filePath };
        case ChangeRowAction.AcceptTheirs:
            return { type: 'changes/acceptTheirs', filePath: entry.filePath };
    }
}

export function messageForBulkAction(action: ChangeBulkAction): ChangesWebviewToExtensionMessage {
    switch (action) {
        case ChangeBulkAction.StageAll:
            return { type: 'changes/stageAll' };
        case ChangeBulkAction.UnstageAll:
            return { type: 'changes/unstageAll' };
        case ChangeBulkAction.DiscardAll:
            return { type: 'changes/discardAll' };
        case ChangeBulkAction.OpenAllMergeEditors:
            return { type: 'changes/openAllMergeEditors' };
        case ChangeBulkAction.AcceptAllTheirs:
            return { type: 'changes/acceptAllTheirs' };
    }
}

export function messageForChangesToolbarCommand(command: ChangesToolbarCommand): ChangesWebviewToExtensionMessage {
    return {
        type: 'changes/toolbarCommand',
        command,
    };
}

export function messageForExplainSelection(target: ChangesSelectionContextTarget): ChangesWebviewToExtensionMessage {
    return { type: 'changes/explainSelection', target };
}

export function messageForExplainRepositoryChanges(submodulePath?: string): ChangesWebviewToExtensionMessage {
    return submodulePath
        ? { type: 'changes/explainRepositoryChanges', submodulePath }
        : { type: 'changes/explainRepositoryChanges' };
}
