import type { GitRepository } from '@application/ports/git-topology';

const MAX_TAGS_PER_REQUEST = 50;
const REMOTE_CHECK_TIMEOUT_MS = 15000;

export interface TagPublication {
    readonly name: string;
    readonly remotes: readonly {
        readonly name: string;
        readonly status: 'same' | 'missing' | 'different' | 'unavailable';
        readonly error?: string;
    }[];
}

export class GetTagPublicationUseCase {
    async execute(repository: GitRepository, names: readonly string[], signal: AbortSignal): Promise<readonly TagPublication[]> {
        if (names.length > MAX_TAGS_PER_REQUEST) { throw new Error('Check at most 50 tags per request.'); }
        const [tags, remotes] = await Promise.all([repository.listTags(signal), repository.listRemotes(signal)]);
        const selected = tags.filter(tag => names.includes(tag.name));
        if (selected.length !== new Set(names).size) { throw new Error("Tags changed locally. Refresh the graph and try again."); }
        const result: { name: string; remotes: TagPublication['remotes'][number][] }[] = selected.map(tag => ({ name: tag.name, remotes: [] }));
        if (selected.length === 0) { return result; }
        for (const remote of remotes) {
            signal.throwIfAborted();
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal.addEventListener('abort', abort, { once: true });
            const timeout = setTimeout(abort, REMOTE_CHECK_TIMEOUT_MS);
            try {
                const refs = await repository.listRemoteTags(remote, selected.map(tag => tag.name), controller.signal);
                for (const [index, tag] of selected.entries()) {
                    const ref = refs.find(item => item.name === tag.name);
                    result[index]?.remotes.push({ name: remote, status: !ref ? 'missing'
                        : ref.objectHash === (tag.objectHash ?? tag.hash) ? 'same' : 'different' });
                }
            } catch (error) {
                signal.throwIfAborted();
                for (const item of result) {
                    item.remotes.push({ name: remote, status: 'unavailable', error: error instanceof Error ? error.message : String(error) });
                }
            } finally {
                clearTimeout(timeout);
                signal.removeEventListener('abort', abort);
            }
        }
        signal.throwIfAborted();
        return result;
    }
}
