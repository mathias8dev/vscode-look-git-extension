import type { GitRepository } from '../../ports/git-repository';

export async function getReachableCommitHashes(
    repo: GitRepository,
    hashes: readonly string[],
    signal?: AbortSignal,
): Promise<ReadonlySet<string>> {
    const uniqueHashes = Array.from(new Set(hashes));
    if (uniqueHashes.length === 0) { return new Set(); }

    const unreachableRaw = await repo.execRaw(['rev-list', '--no-walk', ...uniqueHashes, '--not', 'HEAD'], signal);
    const unreachable = new Set(unreachableRaw.split(/\r?\n/).filter(Boolean));
    return new Set(uniqueHashes.filter((hash) => !isUnreachableHash(hash, unreachable)));
}

function isUnreachableHash(hash: string, unreachable: ReadonlySet<string>): boolean {
    for (const unreachableHash of unreachable) {
        if (unreachableHash === hash || unreachableHash.startsWith(hash) || hash.startsWith(unreachableHash)) {
            return true;
        }
    }
    return false;
}
