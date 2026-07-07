import type { GitRepository, Worktree } from '@application/ports/git-topology';

export interface CheckoutBranchInput {
    readonly branch: string;
    readonly isRemote: boolean;
}

export class CheckoutBranchUseCase {
    async execute(repository: GitRepository, worktree: Worktree, input: CheckoutBranchInput): Promise<void> {
        if (!input.isRemote) {
            await worktree.checkout(input.branch, {});
            return;
        }

        const branches = await repository.listBranches();
        const trackingBranch = branches.find(
            (b) => !b.isRemote && b.upstream === input.branch,
        );
        if (trackingBranch) {
            await worktree.checkout(trackingBranch.name, {});
            return;
        }

        const localName = localNameForRemoteBranch(input.branch);
        const localBranch = branches.find(
            (b) => !b.isRemote && b.name === localName,
        );
        if (localBranch) {
            await worktree.checkout(localBranch.name, {});
            return;
        }

        await worktree.checkoutNewBranch(localName, input.branch);
        await repository.setUpstream(localName, input.branch);
    }
}

function localNameForRemoteBranch(branch: string): string {
    const slashIdx = branch.indexOf('/');
    if (slashIdx === -1 || slashIdx === branch.length - 1) {
        throw new Error(`Expected remote branch name, got "${branch}".`);
    }
    return branch.substring(slashIdx + 1);
}
