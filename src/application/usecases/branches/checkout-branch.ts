import type { GitRepository } from '../../ports/git-repository';

export interface CheckoutBranchInput {
    readonly branch: string;
    readonly isRemote: boolean;
}

export class CheckoutBranchUseCase {
    async execute(repo: GitRepository, input: CheckoutBranchInput): Promise<void> {
        if (!input.isRemote) {
            await repo.checkout(input.branch);
            return;
        }

        const trackingBranch = await localBranchTrackingRemote(repo, input.branch);
        if (trackingBranch) {
            await repo.checkout(trackingBranch);
            return;
        }

        await repo.exec(['checkout', '--track', input.branch]);
    }
}

async function localBranchTrackingRemote(repo: GitRepository, remoteBranch: string): Promise<string | undefined> {
    const output = await repo.execRaw(['for-each-ref', '--format=%(refname:short)%00%(upstream:short)', 'refs/heads']);
    for (const line of output.split('\n')) {
        const [branch, upstream] = line.split('\0');
        if (branch && upstream === remoteBranch) { return branch; }
    }
    return undefined;
}
