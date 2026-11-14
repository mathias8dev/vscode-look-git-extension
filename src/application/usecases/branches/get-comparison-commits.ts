import type { GitHistoryOperations } from '@application/ports/git-capabilities';
import type { GitCommit } from '@core/git/domain/git-commit';
import { Page, type PageRequest } from '@core/git/domain/page';

export class GetComparisonCommits {
    async execute(repository: Pick<GitHistoryOperations, 'getCommitRange'>, base: string, head: string, search: string, request: PageRequest, signal: AbortSignal): Promise<Page<GitCommit>> {
        const query = search.trim().toLowerCase();
        if (!query) { return repository.getCommitRange(base, head, request, signal); }
        const matches: GitCommit[] = [];
        let cursor = request.encodedCursor;
        let nextCursor: string | undefined;
        while (true) {
            signal.throwIfAborted();
            const full = matches.length === request.limit;
            const page = await repository.getCommitRange(base, head, { limit: full ? request.limit : request.limit - matches.length, encodedCursor: cursor }, signal);
            signal.throwIfAborted();
            const filtered = page.items.filter(commit => [commit.message, commit.hash, commit.authorName, commit.authorEmail].some(value => value.toLowerCase().includes(query)));
            if (full && filtered.length > 0) { return new Page(matches, true, nextCursor); }
            if (!full) { matches.push(...filtered); }
            if (!page.hasMore) { return new Page(matches, false); }
            if (!page.encodedNextCursor || page.encodedNextCursor === cursor) { throw new Error('Commit pagination did not advance.'); }
            cursor = page.encodedNextCursor;
            if (matches.length === request.limit && nextCursor === undefined) { nextCursor = cursor; }
        }
    }
}
