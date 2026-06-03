import type { GitRepository } from '../../ports/git-repository';

export async function orderSelectedCommits(
    repo: GitRepository,
    hashes: readonly string[],
    direction: 'newestFirst' | 'oldestFirst',
): Promise<readonly string[]> {
    const unique = Array.from(new Set(hashes));
    if (unique.length <= 1) { return unique; }
    const selected = new Set(unique);
    const orderedNewestFirst = (await repo.exec(['rev-list', '--topo-order', ...unique]))
        .split(/\s+/)
        .filter((candidate) => selected.has(candidate));
    const orderedSet = new Set(orderedNewestFirst);
    const ordered = [
        ...orderedNewestFirst,
        ...unique.filter((candidate) => !orderedSet.has(candidate)),
    ];
    return direction === 'newestFirst' ? ordered : ordered.slice().reverse();
}
