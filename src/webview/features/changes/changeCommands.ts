import type { ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import type { CodiconName } from '../../shared/Codicon';
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
    readonly icon: CodiconName;
    readonly label: string;
    readonly title: string;
}

export function rowActionsFor(item: ChangeListItem): readonly ChangeActionDescriptor<ChangeRowAction>[] {
    if (item.section === 'staged') {
        return [
            { action: 'diff', icon: 'diff', label: 'Diff', title: 'Open diff' },
            { action: 'unstage', icon: 'remove', label: 'Unstage', title: 'Unstage file' },
            { action: 'open', icon: 'go-to-file', label: 'Open', title: 'Open file' },
        ];
    }

    if (item.entry.isSubmodule) {
        if (item.section === 'conflicts') {
            return [
                { action: 'markResolved', icon: 'check', label: 'Resolved', title: 'Mark resolved' },
                { action: 'open', icon: 'folder-opened', label: 'Open', title: 'Open submodule' },
            ];
        }
        return [
            { action: 'stage', icon: 'add', label: 'Stage', title: 'Stage submodule gitlink' },
            { action: 'open', icon: 'folder-opened', label: 'Open', title: 'Open submodule' },
        ];
    }

    if (item.section === 'conflicts') {
        return [
            { action: 'openMergeEditor', icon: 'git-merge', label: 'Merge', title: 'Open merge editor' },
            { action: 'acceptOurs', icon: 'fold-up', label: 'Ours', title: 'Accept current changes (ours)' },
            { action: 'acceptTheirs', icon: 'fold-down', label: 'Theirs', title: 'Accept incoming changes (theirs)' },
            { action: 'markResolved', icon: 'check', label: 'Resolved', title: 'Mark resolved' },
            { action: 'open', icon: 'go-to-file', label: 'Open', title: 'Open file' },
        ];
    }

    return [
        { action: 'diff', icon: 'diff', label: 'Diff', title: 'Open diff' },
        { action: 'stage', icon: 'add', label: 'Stage', title: 'Stage file' },
        { action: 'discard', icon: 'trash', label: 'Discard', title: 'Discard changes' },
        { action: 'open', icon: 'go-to-file', label: 'Open', title: 'Open file' },
    ];
}

export function bulkActionsFor(section: ChangeSection): readonly ChangeActionDescriptor<ChangeBulkAction>[] {
    if (section.id === 'staged') {
        return section.items.length > 0
            ? [{ action: 'unstageAll', icon: 'remove', label: 'Unstage All', title: 'Unstage all staged files' }]
            : [];
    }
    if (section.id === 'unstaged') {
        return section.items.length > 0
            ? [
                { action: 'stageAll', icon: 'add', label: 'Stage All', title: 'Stage all changed files' },
                { action: 'discardAll', icon: 'trash', label: 'Discard All', title: 'Discard all unstaged changes' },
            ]
            : [];
    }
    if (section.id === 'conflicts') {
        return section.items.length > 0
            ? [{ action: 'acceptAllTheirs', icon: 'fold-down', label: 'Accept All Theirs', title: 'Accept incoming for all conflicts' }]
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
