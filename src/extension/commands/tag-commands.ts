import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { TagCommand } from '@protocol/graph/messages';
import { createAndCheckoutBranch } from '@extension/commands/create-and-checkout-branch';
import { pickRemote } from '@extension/git/reference-pickers';

export async function runTagCommand(repository: GitRepository, worktree: Worktree, command: TagCommand, tag: string, signal: AbortSignal): Promise<boolean> {
    const ref = `refs/tags/${tag}`;
    switch (command) {
        case 'checkout':
            await worktree.checkout(ref, { detach: true }, signal);
            return true;
        case 'newBranch':
            return createAndCheckoutBranch(worktree, ref, { label: tag }, signal);
        case 'push': {
            const remote = await pickRemote(`Push tag "${tag}" to remote`, repository, signal);
            signal.throwIfAborted();
            if (!remote) { return false; }
            await worktree.pushRef(remote, ref, ref, {}, signal);
            return true;
        }
    }
}
