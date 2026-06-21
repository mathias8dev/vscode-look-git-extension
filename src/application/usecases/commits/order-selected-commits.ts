import type { GitRepository } from '@application/ports/git-topology';

export async function orderSelectedCommits(
    repo: GitRepository,
    hashes: readonly string[],
    direction: 'newestFirst' | 'oldestFirst',
): Promise<readonly string[]> {
    return repo.orderCommits(hashes, direction);
}
