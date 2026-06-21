import type { GitRepository } from '@application/ports/git-topology';

export async function getReachableCommitHashes(
    repo: GitRepository,
    hashes: readonly string[],
    signal?: AbortSignal,
): Promise<ReadonlySet<string>> {
    return repo.getReachableCommitHashes(hashes, signal);
}
