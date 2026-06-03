import { describe, expect, it } from 'vitest';
import type { GitExec } from '../../../src/core/git/git-exec';
import { queryRemotes } from '../../../src/core/queries/queryGraph';
import { queryStashList } from '../../../src/core/queries/queryStatus';
import { querySubmoduleStatus } from '../../../src/core/queries/querySubmodules';
import { queryWorktrees } from '../../../src/core/queries/queryWorktrees';

function rejectingExec(message: string): GitExec {
    return async () => {
        throw new Error(message);
    };
}

describe('query error propagation', () => {
    it('propagates worktree query failures', async () => {
        await expect(queryWorktrees(rejectingExec('worktree failed'))).rejects.toThrow('worktree failed');
    });

    it('propagates submodule status query failures', async () => {
        await expect(querySubmoduleStatus(rejectingExec('submodule failed'))).rejects.toThrow('submodule failed');
    });

    it('propagates stash list query failures', async () => {
        await expect(queryStashList(rejectingExec('stash failed'))).rejects.toThrow('stash failed');
    });

    it('propagates remote query failures', async () => {
        await expect(queryRemotes(rejectingExec('remote failed'))).rejects.toThrow('remote failed');
    });
});
