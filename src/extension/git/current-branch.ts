import type { GitRepository } from '@application/ports/git-topology';

export async function currentBranchName(repository: GitRepository, fallback = 'HEAD', signal?: AbortSignal): Promise<string> {
    return (await repository.listBranches(signal)).find((branch) => branch.isCurrent)?.name ?? fallback;
}

export async function currentBranchNameOrUndefined(repository: GitRepository, signal?: AbortSignal): Promise<string | undefined> {
    const branch = await currentBranchName(repository, 'HEAD', signal);
    return branch === 'HEAD' ? undefined : branch;
}

export async function currentLocalBranchName(repository: GitRepository, signal?: AbortSignal): Promise<string | undefined> {
    return (await repository.listBranches(signal)).find((branch) => branch.isCurrent && !branch.isRemote)?.name;
}
