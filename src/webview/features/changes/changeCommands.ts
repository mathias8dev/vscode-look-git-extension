import type { ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import type { ChangeListItem, ChangeSection } from './changeTree';

export type ChangeRowAction =
    | 'open'
    | 'diff'
    | 'stage'
    | 'unstage'
    | 'discard'
    | 'openMergeEditor'
    | 'markResolved'
    | 'acceptOurs'
    | 'acceptTheirs';
export type ChangeBulkAction = 'stageAll' | 'unstageAll' | 'discardAll' | 'acceptAllTheirs';

export interface ChangeActionDescriptor<TAction extends string> {
    readonly action: TAction;
    readonly label: string;
    readonly title: string;
}

export function rowActionsFor(item: ChangeListItem): readonly ChangeActionDescriptor<ChangeRowAction>[] {
    const common: ChangeActionDescriptor<ChangeRowAction>[] = [
        { action: 'open', label: 'Open', title: 'Open file' },
        { action: 'diff', label: 'Diff', title: 'Open diff' },
    ];

    if (item.section === 'staged') {
        return [
            { action: 'unstage', label: 'Unstage', title: 'Unstage file' },
            ...common,
        ];
    }

    if (item.entry.isSubmodule) {
        if (item.section === 'conflicts') {
            return [
                { action: 'markResolved', label: 'Resolved', title: 'Mark resolved' },
                ...common,
            ];
        }
        return [
            { action: 'stage', label: 'Stage', title: 'Stage submodule gitlink' },
            ...common,
        ];
    }

    if (item.section === 'conflicts') {
        return [
            { action: 'openMergeEditor', label: 'Merge', title: 'Open merge editor' },
            { action: 'acceptOurs', label: 'Ours', title: 'Accept current changes' },
            { action: 'acceptTheirs', label: 'Theirs', title: 'Accept incoming changes' },
            { action: 'markResolved', label: 'Resolved', title: 'Mark resolved' },
            ...common,
        ];
    }

    return [
        { action: 'stage', label: 'Stage', title: 'Stage file' },
        { action: 'discard', label: 'Discard', title: 'Discard file changes' },
        ...common,
    ];
}

export function bulkActionsFor(section: ChangeSection): readonly ChangeActionDescriptor<ChangeBulkAction>[] {
    if (section.id === 'staged') {
        return section.items.length > 0
            ? [{ action: 'unstageAll', label: 'Unstage All', title: 'Unstage all staged files' }]
            : [];
    }
    if (section.id === 'unstaged') {
        return section.items.length > 0
            ? [
                { action: 'stageAll', label: 'Stage All', title: 'Stage all changed files' },
                { action: 'discardAll', label: 'Discard All', title: 'Discard all unstaged changes' },
            ]
            : [];
    }
    if (section.id === 'conflicts') {
        return section.items.length > 0
            ? [{ action: 'acceptAllTheirs', label: 'Accept All Theirs', title: 'Accept incoming changes for all conflicts' }]
            : [];
    }
    return [];
}

export function messageForRowAction(item: ChangeListItem, action: ChangeRowAction): ChangesWebviewToExtensionMessage {
    const entry = item.entry;
    switch (action) {
        case 'open':
            return entry.isSubmodule
                ? { type: 'changes/openSubmodule', filePath: entry.filePath }
                : { type: 'changes/openFile', filePath: entry.filePath };
        case 'diff':
            return {
                type: 'changes/openDiff',
                filePath: entry.filePath,
                origPath: entry.origPath,
                isStaged: item.isStaged,
                indexStatus: entry.indexStatus,
                workTreeStatus: entry.workTreeStatus,
            };
        case 'stage':
            return { type: 'changes/stageFile', filePath: entry.filePath };
        case 'unstage':
            return { type: 'changes/unstageFile', filePath: entry.filePath };
        case 'discard':
            return { type: 'changes/discardFile', filePath: entry.filePath };
        case 'openMergeEditor':
            return { type: 'changes/openMergeEditor', filePath: entry.filePath };
        case 'markResolved':
            return { type: 'changes/markResolved', filePath: entry.filePath };
        case 'acceptOurs':
            return { type: 'changes/acceptOurs', filePath: entry.filePath };
        case 'acceptTheirs':
            return { type: 'changes/acceptTheirs', filePath: entry.filePath };
    }
}

export function messageForBulkAction(action: ChangeBulkAction): ChangesWebviewToExtensionMessage {
    switch (action) {
        case 'stageAll':
            return { type: 'changes/stageAll' };
        case 'unstageAll':
            return { type: 'changes/unstageAll' };
        case 'discardAll':
            return { type: 'changes/discardAll' };
        case 'acceptAllTheirs':
            return { type: 'changes/acceptAllTheirs' };
    }
}
