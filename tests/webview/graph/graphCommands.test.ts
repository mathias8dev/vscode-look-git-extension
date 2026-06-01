import { describe, expect, it } from 'vitest';
import { messageForCommitCommand } from '../../../src/webview/features/graph/graphCommands';

describe('graphCommands', () => {
    it('sends commit command selections', () => {
        expect(messageForCommitCommand('cherryPick', 'c', ['a', 'b', 'c'])).toEqual({
            type: 'graph/commitCommand',
            command: 'cherryPick',
            hash: 'c',
            hashes: ['a', 'b', 'c'],
        });
    });
});
