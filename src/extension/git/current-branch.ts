import type { GitRepository } from '@application/ports/git-topology';

export async function currentBranchName(repository: GitRepository, fallback = 'HEAD'): Promise<string> {
    return (await repository.listBranches()).find((branch) => branch.isCurrent)?.name ?? fallback;
}

export async function currentBranchNameOrUndefined(repository: GitRepository): Promise<string | undefined> {
    const branch = await currentBranchName(repository, 'HEAD');
    return branch === 'HEAD' ? undefined : branch;
}

export async function currentLocalBranchName(repository: GitRepository): Promise<string | undefined> {
    return (await repository.listBranches()).find((branch) => branch.isCurrent && !branch.isRemote)?.name;
}
