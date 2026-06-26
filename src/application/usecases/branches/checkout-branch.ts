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

        await worktree.checkout(input.branch, {});
    }
}
