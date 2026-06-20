import type { GitHistoryOperations } from '../../ports/git-capabilities';

export async function getReachableCommitHashes(
    repo: Pick<GitHistoryOperations, 'getReachableCommitHashes'>,
    hashes: readonly string[],
    signal?: AbortSignal,
): Promise<ReadonlySet<string>> {
    return repo.getReachableCommitHashes(hashes, signal);
}
