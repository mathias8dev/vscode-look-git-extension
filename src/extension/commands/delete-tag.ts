import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { TagDeletionScope } from '@extension/git/tag-deletion-scope';
import { pickRemote } from '@extension/git/reference-pickers';
import { showModalWarningMessage } from '@extension/utils/confirmation';

export async function deleteTag(repository: GitRepository, worktree: Pick<Worktree, 'pushRef'>, tag: string, scope: TagDeletionScope, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const local = scope === TagDeletionScope.Local || scope === TagDeletionScope.LocalAndRemote;
    const remoteTag = scope === TagDeletionScope.Remote || scope === TagDeletionScope.LocalAndRemote;
    if (!local && !remoteTag) { throw new Error('Unsupported tag deletion scope.'); }
    const remote = remoteTag ? await pickRemote(`Delete tag "${tag}" from remote`, repository, signal) : undefined;
    signal?.throwIfAborted();
    if (remoteTag && !remote) { return false; }
    const message = remote
        ? local ? `Delete local tag "${tag}" and its tag on remote "${remote}"?` : `Delete tag "${tag}" from remote "${remote}"?`
        : `Delete local tag "${tag}"?`;
    const choice = await showModalWarningMessage(message, 'Delete');
    signal?.throwIfAborted();
    if (choice !== 'Delete') { return false; }
    if (remote) { await worktree.pushRef(remote, '', `refs/tags/${tag}`, {}, signal); }
    if (local) {
        try {
            await repository.deleteTag(tag, signal);
        } catch (error) {
            if (!remote) { throw error; }
            const details = error instanceof Error ? error.message : String(error);
            throw new Error(`Tag "${tag}" was deleted from remote "${remote}", but local deletion failed: ${details}`, { cause: error });
        }
    }
    return true;
}
