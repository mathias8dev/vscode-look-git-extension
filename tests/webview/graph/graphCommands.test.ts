import { describe, expect, it } from 'vitest';
import { messageForBranchCommand, messageForCommitCommand } from '../../../src/webview/features/graph/graphCommands';

describe('graphCommands', () => {
    it('sends commit command selections', () => {
        expect(messageForCommitCommand('cherryPick', 'c', ['a', 'b', 'c'])).toEqual({
            type: 'graph/commitCommand',
            command: 'cherryPick',
            hash: 'c',
            hashes: ['a', 'b', 'c'],
        });
    });

    it('sends branch commands', () => {
        expect(messageForBranchCommand('mergeInto', 'feature/ui', false)).toEqual({
            type: 'graph/branchCommand',
            command: 'mergeInto',
            branch: 'feature/ui',
            isRemote: false,
        });
    });
});
