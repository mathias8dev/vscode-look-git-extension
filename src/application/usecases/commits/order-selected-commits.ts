import type { GitHistoryOperations } from '../../ports/git-capabilities';

export async function orderSelectedCommits(
    repo: Pick<GitHistoryOperations, 'orderCommits'>,
    hashes: readonly string[],
    direction: 'newestFirst' | 'oldestFirst',
): Promise<readonly string[]> {
    return repo.orderCommits(hashes, direction);
}
