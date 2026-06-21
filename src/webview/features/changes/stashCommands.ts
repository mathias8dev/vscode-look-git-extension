import type { ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import type { StashFileEntry } from '@protocol/changes/types';

export enum CreateStashKind {
    All = 'all',
    Staged = 'staged',
}

export enum StashEntryAction {
    Apply = 'apply',
    Pop = 'pop',
    Drop = 'drop',
    LoadFiles = 'loadFiles',
}

export function messageForCreateStash(
    kind: CreateStashKind,
    message: string,
): ChangesWebviewToExtensionMessage {
    const trimmedMessage = message.trim();
    const payload = trimmedMessage ? { message: trimmedMessage } : {};
    return kind === CreateStashKind.Staged
        ? { type: 'changes/stashStaged', ...payload }
        : { type: 'changes/stash', ...payload };
}

export function messageForStashAction(index: number, action: StashEntryAction): ChangesWebviewToExtensionMessage {
    switch (action) {
        case StashEntryAction.Apply:
            return { type: 'changes/stashApply', index };
        case StashEntryAction.Pop:
            return { type: 'changes/stashPop', index };
        case StashEntryAction.Drop:
            return { type: 'changes/stashDrop', index };
        case StashEntryAction.LoadFiles:
            return { type: 'changes/getStashFiles', index, requestId: stashFilesRequestId(index) };
    }
}

export function messageForStashFileDiff(index: number, file: StashFileEntry): ChangesWebviewToExtensionMessage {
    return {
        type: 'changes/openStashDiff',
        index,
        filePath: file.filePath,
        origPath: file.origPath,
        status: file.status,
    };
}

export function stashFilesRequestId(index: number): string {
    return `changes:stash-files:${index}`;
}
