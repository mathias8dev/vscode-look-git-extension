import type { GitTagRef } from '@core/git/domain/git-tag-ref';

export function parseRemoteTagRefs(output: string): readonly GitTagRef[] {
    return output.split(/\r?\n/).filter(Boolean).map(line => {
        const separator = line.indexOf('\t');
        const hash = line.slice(0, separator);
        const ref = line.slice(separator + 1);
        if (separator < 0 || !/^[a-f0-9]+$/i.test(hash) || !ref.startsWith('refs/tags/') || ref.endsWith('^{}')) {
            throw new Error('Invalid remote tag reference.');
        }
        return { name: ref.slice('refs/tags/'.length), objectHash: hash };
    });
}
