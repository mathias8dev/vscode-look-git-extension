import type { GitBranch } from '../../../core/git/domain/GitStatus';

export interface CheckoutBranchInput {
    readonly branch: string;
    readonly isRemote: boolean;
}

export interface CheckoutBranchDeps {
    checkout(ref: string, options: { readonly detach?: boolean }): Promise<void>;
    listBranches(): Promise<readonly GitBranch[]>;
}

export class CheckoutBranchUseCase {
    async execute(deps: CheckoutBranchDeps, input: CheckoutBranchInput): Promise<void> {
        if (!input.isRemote) {
            await deps.checkout(input.branch, {});
            return;
        }

        const branches = await deps.listBranches();
        const trackingBranch = branches.find(
            (b) => !b.isRemote && b.upstream === input.branch,
        );
        if (trackingBranch) {
            await deps.checkout(trackingBranch.name, {});
            return;
        }

        await deps.checkout(input.branch, {});
    }
}
