import { describe, expect, it, vi } from 'vitest';
import type { GitCommit } from '@core/git/domain/git-commit';
import { Page, type PageRequest } from '@core/git/domain/page';
import { GetComparisonCommits } from '@application/usecases/branches/get-comparison-commits';

const commits: readonly GitCommit[] = Array.from({ length: 12 }, (_, index) => ({
    hash: String(index).padStart(40, 'a'), shortHash: String(index).padStart(7, 'a'),
    message: index % 3 === 0 ? `Target [${index}]` : `Other ${index}`,
    authorName: index === 8 ? 'Zoé Example' : 'Other Author', authorEmail: 'author@example.com',
    authorDate: '2026-11-14T09:00:00Z', parentHashes: [],
}));

function fixture() {
    const getCommitRange = vi.fn(async (_base: string, _head: string, page: PageRequest) => {
        const offset = Number(page.encodedCursor ?? 0);
        const items = commits.slice(offset, offset + page.limit);
        const hasMore = offset + page.limit < commits.length;
        return new Page(items, hasMore, hasMore ? String(offset + page.limit) : undefined);
    });
    return { getCommitRange };
}

describe('GetComparisonCommits', () => {
    const useCase = new GetComparisonCommits();

    it('searches beyond the first raw page and paginates matches without duplicates or an empty trailing page', async () => {
        const repository = fixture();
        const signal = new AbortController().signal;
        const first = await useCase.execute(repository, 'base', 'head', 'TARGET', { limit: 2 }, signal);
        expect(first.items.map(commit => commit.message)).toEqual(['Target [0]', 'Target [3]']);
        expect(first.hasMore).toBe(true);
        const second = await useCase.execute(repository, 'base', 'head', 'TARGET', { limit: 2, encodedCursor: first.encodedNextCursor }, signal);
        expect(second.items.map(commit => commit.message)).toEqual(['Target [6]', 'Target [9]']);
        expect(second.hasMore).toBe(false);
        expect(repository.getCommitRange).toHaveBeenCalledWith('base', 'head', expect.objectContaining({ limit: 2 }), signal);
    });

    it.each([
        { query: 'zoé', indexes: [8] }, { query: commits[8]!.hash.slice(-8), indexes: [8] },
        { query: '[6]', indexes: [6] }, { query: 'AUTHOR@EXAMPLE.COM', indexes: commits.map((_, index) => index) },
        { query: 'absent', indexes: [] },
    ])('matches literal text, authors and hashes for $query', async ({ query, indexes }) => {
        const page = await useCase.execute(fixture(), 'base', 'head', query, { limit: 50 }, new AbortController().signal);
        expect(page.items).toEqual(indexes.map(index => commits[index]));
        expect(page.hasMore).toBe(false);
    });

    it('uses the original range pagination for an empty query', async () => {
        const repository = fixture();
        const signal = new AbortController().signal;
        await useCase.execute(repository, 'base', 'head', '  ', { limit: 2, encodedCursor: '4' }, signal);
        expect(repository.getCommitRange).toHaveBeenCalledExactlyOnceWith('base', 'head', { limit: 2, encodedCursor: '4' }, signal);
    });

    it('stops immediately when a page completes after cancellation', async () => {
        const repository = fixture();
        const controller = new AbortController();
        repository.getCommitRange.mockImplementationOnce(async () => { controller.abort(); return new Page(commits.slice(0, 2), true, '2'); });
        await expect(useCase.execute(repository, 'base', 'head', 'absent', { limit: 2 }, controller.signal)).rejects.toThrow();
        expect(repository.getCommitRange).toHaveBeenCalledOnce();
    });
});
