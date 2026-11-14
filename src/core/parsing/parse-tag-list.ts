import type { GitTag } from '@core/git/domain/git-status';

export function parseTagList(output: string): readonly GitTag[] {
    return output.split(/\r?\n/).filter(Boolean).map(line => {
        const [name = '', objectHash = '', targetHash] = line.split('\0');
        return { name, hash: targetHash || objectHash, objectHash };
    });
}
