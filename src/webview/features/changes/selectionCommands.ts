import type { ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import { messageForRowAction, type ChangeActionDescriptor } from './changeCommands';
import type { ChangeListItem } from './changeTree';

export type ChangeSelectionAction =
    | 'open'
    | 'diff'
    | 'stage'
    | 'unstage'
    | 'discard'
    | 'acceptOurs'
    | 'acceptTheirs'
    | 'markResolved';

export function selectionActionsFor(items: readonly ChangeListItem[]): readonly ChangeActionDescriptor<ChangeSelectionAction>[] {
    if (items.length === 0) { return []; }
    const singleFileActions: ChangeActionDescriptor<ChangeSelectionAction>[] = items.length === 1
        ? [
            { action: 'diff', icon: 'diff', label: 'Diff', title: 'Open selected file diff' },
            { action: 'open', icon: 'go-to-file', label: 'Open', title: 'Open selected file' },
        ]
        : [];

    return [
        ...singleFileActions,
        ...actionIf(hasSection(items, 'unstaged'), { action: 'stage', icon: 'add', label: 'Stage', title: 'Stage selected changes' }),
        ...actionIf(hasSection(items, 'staged'), { action: 'unstage', icon: 'remove', label: 'Unstage', title: 'Unstage selected changes' }),
        ...actionIf(hasActionableSection(items, 'unstaged'), { action: 'discard', icon: 'trash', label: 'Discard', title: 'Discard selected changes' }),
        ...actionIf(hasActionableSection(items, 'conflicts'), { action: 'acceptOurs', icon: 'fold-up', label: 'Ours', title: 'Accept current changes for selected conflicts' }),
        ...actionIf(hasActionableSection(items, 'conflicts'), { action: 'acceptTheirs', icon: 'fold-down', label: 'Theirs', title: 'Accept incoming changes for selected conflicts' }),
        ...actionIf(hasSection(items, 'conflicts'), { action: 'markResolved', icon: 'check', label: 'Resolved', title: 'Mark selected conflicts resolved' }),
    ];
}

export function messageForSelectionAction(
    items: readonly ChangeListItem[],
    action: ChangeSelectionAction,
): ChangesWebviewToExtensionMessage | undefined {
    const firstItem = items[0];
    if ((action === 'open' || action === 'diff') && items.length === 1 && firstItem) {
        return messageForRowAction(firstItem, action);
    }

    switch (action) {
        case 'stage':
            return filesMessage('changes/stageFiles', pathsForSection(items, 'unstaged'));
        case 'unstage':
            return filesMessage('changes/unstageFiles', pathsForSection(items, 'staged'));
        case 'discard':
            return filesMessage('changes/discardFiles', actionablePathsForSection(items, 'unstaged'));
        case 'acceptOurs':
            return filesMessage('changes/acceptOursFiles', actionablePathsForSection(items, 'conflicts'));
        case 'acceptTheirs':
            return filesMessage('changes/acceptTheirsFiles', actionablePathsForSection(items, 'conflicts'));
        case 'markResolved':
            return filesMessage('changes/markResolvedFiles', pathsForSection(items, 'conflicts'));
        case 'open':
        case 'diff':
            return undefined;
    }
}

function actionIf<TAction extends ChangeSelectionAction>(
    condition: boolean,
    descriptor: ChangeActionDescriptor<TAction>,
): readonly ChangeActionDescriptor<TAction>[] {
    return condition ? [descriptor] : [];
}

function hasSection(items: readonly ChangeListItem[], section: ChangeListItem['section']): boolean {
    return items.some((item) => item.section === section);
}

function hasActionableSection(items: readonly ChangeListItem[], section: ChangeListItem['section']): boolean {
    return items.some((item) => item.section === section && !item.entry.isSubmodule);
}

function pathsForSection(items: readonly ChangeListItem[], section: ChangeListItem['section']): readonly string[] {
    return items.filter((item) => item.section === section).map((item) => item.entry.filePath);
}

function actionablePathsForSection(items: readonly ChangeListItem[], section: ChangeListItem['section']): readonly string[] {
    return items
        .filter((item) => item.section === section && !item.entry.isSubmodule)
        .map((item) => item.entry.filePath);
}

function filesMessage(
    type:
        | 'changes/stageFiles'
        | 'changes/unstageFiles'
        | 'changes/discardFiles'
        | 'changes/acceptOursFiles'
        | 'changes/acceptTheirsFiles'
        | 'changes/markResolvedFiles',
    filePaths: readonly string[],
): ChangesWebviewToExtensionMessage | undefined {
    return filePaths.length > 0 ? { type, filePaths } : undefined;
}
