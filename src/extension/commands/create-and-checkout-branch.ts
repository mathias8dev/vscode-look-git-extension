import type { Worktree } from '@application/ports/git-topology';
import { showBranchNameInput } from '@extension/utils/branch-name-input';

export async function createAndCheckoutBranch(worktree: Worktree, startPoint: string, options: {
    readonly label: string;
    readonly value?: string;
}, signal?: AbortSignal): Promise<boolean> {
    const name = await showBranchNameInput({ prompt: `Create branch from "${options.label}":`, value: options.value });
    signal?.throwIfAborted();
    if (!name) { return false; }
    await worktree.checkoutNewBranch(name, startPoint, signal);
    return true;
}
