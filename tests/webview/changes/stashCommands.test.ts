import { describe, expect, it } from 'vitest';
import {
    messageForCreateStash,
    messageForStashAction,
    messageForStashFileDiff,
    stashFilesRequestId,
} from '../../../src/webview/features/changes/stashCommands';

describe('stashCommands', () => {
    it('creates stash commands with normalized optional messages', () => {
        expect(messageForCreateStash('all', '  save work  ')).toEqual({
            type: 'changes/stash',
            message: 'save work',
        });
        expect(messageForCreateStash('staged', '   ')).toEqual({ type: 'changes/stashStaged' });
    });

    it('creates stash entry action messages', () => {
        expect(messageForStashAction(2, 'apply')).toEqual({ type: 'changes/stashApply', index: 2 });
        expect(messageForStashAction(2, 'pop')).toEqual({ type: 'changes/stashPop', index: 2 });
        expect(messageForStashAction(2, 'drop')).toEqual({ type: 'changes/stashDrop', index: 2 });
        expect(messageForStashAction(2, 'loadFiles')).toEqual({
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
