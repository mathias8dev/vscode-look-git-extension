import { describe, expect, it } from 'vitest';
import {
    messageForCreateStash,
    messageForStashAction,
    messageForStashFileDiff,
    stashFilesRequestId,
    CreateStashKind,
    StashEntryAction,
} from '@webview/features/changes/stash-commands';

describe('stashCommands', () => {
    it('creates stash commands with normalized optional messages', () => {
        expect(messageForCreateStash(CreateStashKind.All, '  save work  ')).toEqual({
            type: 'changes/stash',
            message: 'save work',
        });
        expect(messageForCreateStash(CreateStashKind.Staged, '   ')).toEqual({ type: 'changes/stashStaged' });
    });

    it('creates stash entry action messages', () => {
        expect(messageForStashAction(2, StashEntryAction.Apply)).toEqual({ type: 'changes/stashApply', index: 2 });
        expect(messageForStashAction(2, StashEntryAction.Pop)).toEqual({ type: 'changes/stashPop', index: 2 });
        expect(messageForStashAction(2, StashEntryAction.Drop)).toEqual({ type: 'changes/stashDrop', index: 2 });
        expect(messageForStashAction(2, StashEntryAction.LoadFiles)).toEqual({
            type: 'changes/getStashFiles',
            index: 2,
            requestId: 'changes:stash-files:2',
        });
    });

    it('creates stash file diff messages', () => {
        expect(messageForStashFileDiff(1, {
            status: 'R',
            filePath: 'src/new.ts',
            origPath: 'src/old.ts',
        })).toEqual({
            type: 'changes/openStashDiff',
            index: 1,
            status: 'R',
            filePath: 'src/new.ts',
            origPath: 'src/old.ts',
        });
    });

    it('uses stable stash files request ids', () => {
        expect(stashFilesRequestId(4)).toBe('changes:stash-files:4');
    });
});
