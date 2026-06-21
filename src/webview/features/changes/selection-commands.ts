import type { ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import { ChangeRowAction, messageForRowAction, type ChangeActionDescriptor } from '@webview/features/changes/change-commands';
import { changesSelectionTarget, hasPatchableSelectionTarget } from '@webview/features/changes/change-selection-model';
import { ChangeSectionId, type ChangeListItem } from '@webview/features/changes/change-tree';

export enum ChangeSelectionAction {
    Open = 'open',
    Diff = 'diff',
    Stage = 'stage',
    Unstage = 'unstage',
    Discard = 'discard',
    AcceptOurs = 'acceptOurs',
    AcceptTheirs = 'acceptTheirs',
    MarkResolved = 'markResolved',
    CreatePatch = 'createPatch',
}

export function selectionActionsFor(items: readonly ChangeListItem[]): readonly ChangeActionDescriptor<ChangeSelectionAction>[] {
    if (items.length === 0) { return []; }
    const singleFileActions: ChangeActionDescriptor<ChangeSelectionAction>[] = items.length === 1
        ? [
            { action: ChangeSelectionAction.Diff, icon: 'diff', label: 'Diff', title: 'Open selected file diff' },
            { action: ChangeSelectionAction.Open, icon: 'go-to-file', label: 'Open', title: 'Open selected file' },
        ]
        : [];

    return [
        ...singleFileActions,
        ...actionIf(hasSection(items, ChangeSectionId.Unstaged), { action: ChangeSelectionAction.Stage, icon: 'add', label: 'Stage', title: 'Stage selected changes' }),
        ...actionIf(hasSection(items, ChangeSectionId.Staged), { action: ChangeSelectionAction.Unstage, icon: 'remove', label: 'Unstage', title: 'Unstage selected changes' }),
        ...actionIf(hasActionableSection(items, ChangeSectionId.Unstaged), { action: ChangeSelectionAction.Discard, icon: 'discard', label: 'Discard', title: 'Discard selected changes' }),
        ...actionIf(hasActionableSection(items, ChangeSectionId.Conflicts), { action: ChangeSelectionAction.AcceptOurs, icon: 'fold-up', label: 'Ours', title: 'Accept current changes for selected conflicts' }),
        ...actionIf(hasActionableSection(items, ChangeSectionId.Conflicts), { action: ChangeSelectionAction.AcceptTheirs, icon: 'fold-down', label: 'Theirs', title: 'Accept incoming changes for selected conflicts' }),
        ...actionIf(hasSection(items, ChangeSectionId.Conflicts), { action: ChangeSelectionAction.MarkResolved, icon: 'check', label: 'Resolved', title: 'Mark selected conflicts resolved' }),
        ...actionIf(hasPatchableSelection(items), { action: ChangeSelectionAction.CreatePatch, icon: 'diff', label: 'Patch', title: 'Create patch from selected changes' }),
    ];
}

export function messageForSelectionAction(
    items: readonly ChangeListItem[],
    action: ChangeSelectionAction,
): ChangesWebviewToExtensionMessage | undefined {
    const firstItem = items[0];
    if ((action === ChangeSelectionAction.Open || action === ChangeSelectionAction.Diff) && items.length === 1 && firstItem) {
        return messageForRowAction(firstItem, action as unknown as ChangeRowAction);
    }

    switch (action) {
        case ChangeSelectionAction.Stage:
            return filesMessage('changes/stageFiles', pathsForSection(items, ChangeSectionId.Unstaged));
        case ChangeSelectionAction.Unstage:
            return filesMessage('changes/unstageFiles', pathsForSection(items, ChangeSectionId.Staged));
        case ChangeSelectionAction.Discard:
            return filesMessage('changes/discardFiles', actionablePathsForSection(items, ChangeSectionId.Unstaged));
        case ChangeSelectionAction.AcceptOurs:
            return filesMessage('changes/acceptOursFiles', actionablePathsForSection(items, ChangeSectionId.Conflicts));
        case ChangeSelectionAction.AcceptTheirs:
            return filesMessage('changes/acceptTheirsFiles', actionablePathsForSection(items, ChangeSectionId.Conflicts));
        case ChangeSelectionAction.MarkResolved:
            return filesMessage('changes/markResolvedFiles', pathsForSection(items, ChangeSectionId.Conflicts));
        case ChangeSelectionAction.CreatePatch:
            return undefined;
        case ChangeSelectionAction.Open:
        case ChangeSelectionAction.Diff:
            return undefined;
    }
}

function actionIf<TAction extends ChangeSelectionAction>(
    condition: boolean,
    descriptor: ChangeActionDescriptor<TAction>,
): readonly ChangeActionDescriptor<TAction>[] {
    return condition ? [descriptor] : [];
}

function hasSection(items: readonly ChangeListItem[], section: ChangeSectionId): boolean {
    return items.some((item) => item.section === section);
}

function hasActionableSection(items: readonly ChangeListItem[], section: ChangeSectionId): boolean {
    return items.some((item) => item.section === section && !item.entry.isSubmodule);
}

function hasPatchableSelection(items: readonly ChangeListItem[]): boolean {
    return hasPatchableSelectionTarget(changesSelectionTarget(items));
}

function pathsForSection(items: readonly ChangeListItem[], section: ChangeSectionId): readonly string[] {
    return items.filter((item) => item.section === section).map((item) => item.entry.filePath);
}

function actionablePathsForSection(items: readonly ChangeListItem[], section: ChangeSectionId): readonly string[] {
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
