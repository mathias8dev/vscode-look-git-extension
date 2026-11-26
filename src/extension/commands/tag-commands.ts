import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { TagCommand } from '@protocol/graph/messages';
import { createAndCheckoutBranch } from '@extension/commands/create-and-checkout-branch';
import { pickRemote } from '@extension/git/reference-pickers';
import { deleteTag } from '@extension/commands/delete-tag';
import { pickTagDeletionScope } from '@extension/git/git-option-pickers';

export async function runTagCommand(repository: GitRepository, worktree: Worktree, command: TagCommand, tag: string, signal: AbortSignal): Promise<boolean> {
    const ref = `refs/tags/${tag}`;
    switch (command) {
        case TagCommand.Checkout:
            await worktree.checkout(ref, { detach: true }, signal);
            return true;
        case TagCommand.NewBranch:
            return createAndCheckoutBranch(worktree, ref, { label: tag }, signal);
        case TagCommand.Delete: {
            const remotes = await repository.listRemotes(signal);
            signal.throwIfAborted();
            const scope = await pickTagDeletionScope(tag, remotes.length > 0);
            signal.throwIfAborted();
            return scope === undefined ? false : deleteTag(repository, worktree, tag, scope, signal);
        }
        case TagCommand.Push: {
            const remote = await pickRemote(`Push tag "${tag}" to remote`, repository, signal);
            signal.throwIfAborted();
            if (!remote) { return false; }
            await worktree.pushRef(remote, ref, ref, {}, signal);
            return true;
        }
    }
}
