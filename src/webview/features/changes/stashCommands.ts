import type { ChangesWebviewToExtensionMessage } from '../../../protocol/changes/messages';
import type { StashFileEntry } from '../../../protocol/changes/types';

export type CreateStashKind = 'all' | 'staged';
export type StashEntryAction = 'apply' | 'pop' | 'drop' | 'loadFiles';

export function messageForCreateStash(
    kind: CreateStashKind,
    message: string,
): ChangesWebviewToExtensionMessage {
    const trimmedMessage = message.trim();
    const payload = trimmedMessage ? { message: trimmedMessage } : {};
    return kind === 'staged'
        ? { type: 'changes/stashStaged', ...payload }
        : { type: 'changes/stash', ...payload };
}

export function messageForStashAction(index: number, action: StashEntryAction): ChangesWebviewToExtensionMessage {
    switch (action) {
        case 'apply':
            return { type: 'changes/stashApply', index };
        case 'pop':
            return { type: 'changes/stashPop', index };
        case 'drop':
            return { type: 'changes/stashDrop', index };
        case 'loadFiles':
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
