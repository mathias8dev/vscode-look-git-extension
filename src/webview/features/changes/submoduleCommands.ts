import type { ChangesToolbarCommand, ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import type { ChangesContextTarget, ConflictState, StashFileEntry, StatusEntry } from '../../../protocol/changes/types';
import { CommitMode } from '../../../protocol/changes/types';
import { ChangeBulkAction, ChangeRowAction } from './changeCommands';
import { OperationAction } from './operationCommands';
import { StashEntryAction } from './stashCommands';

export enum SubmoduleAction {
    Refresh   = 'refresh',
    Pull      = 'pull',
    Push      = 'push',
    Update    = 'update',
    Open      = 'open',
    UpdateAll = 'updateAll',
}

export function messageForSubmoduleAction(
    submodulePath: string,
    action: SubmoduleAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case SubmoduleAction.Update:
            return { type: 'changes/submoduleUpdate', path: submodulePath };
        case SubmoduleAction.Open:
            return { type: 'changes/openSubmodule', filePath: submodulePath };
        case SubmoduleAction.UpdateAll:
            return { type: 'changes/submoduleUpdateAll' };
        case SubmoduleAction.Refresh:
            return messageForGetSubmoduleStatus(submodulePath, submoduleStatusRequestId(submodulePath));
        case SubmoduleAction.Pull:
            return messageForSubmoduleToolbarCommand(submodulePath, 'pull');
        case SubmoduleAction.Push:
            return messageForSubmoduleToolbarCommand(submodulePath, 'push');
    }
}

export function messageForChangesContextTarget(target: ChangesContextTarget): ChangesWebviewToExtensionMessage {
    return { type: 'changes/contextTarget', target };
}

export function messageForSubmoduleToolbarCommand(
    submodulePath: string,
    command: ChangesToolbarCommand,
): ChangesWebviewToExtensionMessage {
    return { type: 'changes/submoduleToolbarCommand', submodulePath, command };
}

export function messageForGetSubmoduleStatus(submodulePath: string, requestId: string): ChangesWebviewToExtensionMessage {
    return { type: 'changes/getSubmoduleStatus', path: submodulePath, requestId };
}

export function messageForSubmoduleDiff(
    submodulePath: string,
    entry: StatusEntry,
    isStaged: boolean,
): ChangesWebviewToExtensionMessage {
    return {
        type: 'changes/openSubmoduleDiff',
        submodulePath,
        filePath: entry.filePath,
        origPath: entry.origPath,
        isStaged,
        indexStatus: entry.indexStatus,
        workTreeStatus: entry.workTreeStatus,
    };
}

export function messageForSubmoduleRowAction(
    submodulePath: string,
    entry: StatusEntry,
    isStaged: boolean,
    action: ChangeRowAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case ChangeRowAction.Open:
            return { type: 'changes/submoduleOpenFile', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.Diff:
            return messageForSubmoduleDiff(submodulePath, entry, isStaged);
        case ChangeRowAction.Stage:
            return { type: 'changes/submoduleStageFile', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.Unstage:
            return { type: 'changes/submoduleUnstageFile', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.Discard:
            return { type: 'changes/submoduleDiscardFile', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.OpenMergeEditor:
            return { type: 'changes/submoduleOpenMergeEditor', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.MarkResolved:
            return { type: 'changes/submoduleMarkResolved', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.AcceptOurs:
            return { type: 'changes/submoduleAcceptOurs', submodulePath, filePath: entry.filePath };
        case ChangeRowAction.AcceptTheirs:
            return { type: 'changes/submoduleAcceptTheirs', submodulePath, filePath: entry.filePath };
    }
}

export function messageForSubmoduleBulkAction(
    submodulePath: string,
    action: ChangeBulkAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case ChangeBulkAction.StageAll:
            return { type: 'changes/submoduleStageAll', submodulePath };
        case ChangeBulkAction.UnstageAll:
            return { type: 'changes/submoduleUnstageAll', submodulePath };
        case ChangeBulkAction.DiscardAll:
            return { type: 'changes/submoduleDiscardAll', submodulePath };
        case ChangeBulkAction.AcceptAllTheirs:
            return { type: 'changes/submoduleAcceptAllTheirs', submodulePath };
    }
}

export function messageForSubmoduleOperationAction(
    submodulePath: string,
    conflictState: ConflictState,
    action: OperationAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case OperationAction.AcceptAllTheirs:
            return { type: 'changes/submoduleAcceptAllTheirs', submodulePath };
        case OperationAction.Continue:
            return { type: 'changes/submoduleContinueOp', submodulePath, conflictState };
        case OperationAction.Abort:
            return { type: 'changes/submoduleAbortOp', submodulePath, conflictState };
    }
}

export function messageForSubmoduleStash(submodulePath: string, message: string): ChangesWebviewToExtensionMessage {
    const trimmedMessage = message.trim();
    return trimmedMessage
        ? { type: 'changes/submoduleStash', submodulePath, message: trimmedMessage }
        : { type: 'changes/submoduleStash', submodulePath };
}

export function messageForSubmoduleCommit(
    submodulePath: string,
    message: string,
    mode: CommitMode,
): ChangesWebviewToExtensionMessage {
    return { type: 'changes/submoduleCommit', submodulePath, message, mode };
}

export function messageForSubmoduleStashAction(
    submodulePath: string,
    index: number,
    action: StashEntryAction,
): ChangesWebviewToExtensionMessage {
    switch (action) {
        case StashEntryAction.Apply:
            return { type: 'changes/submoduleStashApply', submodulePath, index };
        case StashEntryAction.Pop:
            return { type: 'changes/submoduleStashPop', submodulePath, index };
        case StashEntryAction.Drop:
            return { type: 'changes/submoduleStashDrop', submodulePath, index };
        case StashEntryAction.LoadFiles:
            return { type: 'changes/getSubmoduleStashFiles', submodulePath, index, requestId: submoduleStashFilesRequestId(submodulePath, index) };
    }
}

export function messageForSubmoduleStashFileDiff(
    submodulePath: string,
    index: number,
    file: StashFileEntry,
): ChangesWebviewToExtensionMessage {
    return {
        type: 'changes/openSubmoduleStashDiff',
        submodulePath,
        index,
        filePath: file.filePath,
        origPath: file.origPath,
        status: file.status,
    };
}

export function submoduleStatusRequestId(submodulePath: string): string {
    return `changes:submodule-status:${submodulePath}`;
}

export function submoduleStashFilesRequestId(submodulePath: string, index: number): string {
    return `changes:submodule-stash-files:${submodulePath}:${index}`;
}
