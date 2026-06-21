import { describe, expect, it } from 'vitest';
import { Page } from '@core/git/domain/Page';
import type { PageCursor, PageRequest } from '@core/git/domain/Page';

describe('Page', () => {
    it('represents a bounded page with an optional next cursor', () => {
        const page = new Page(['a', 'b'], true, 'cursor-2');

        expect(page.items).toEqual(['a', 'b']);
        expect(page.hasMore).toBe(true);
        expect(page.encodedNextCursor).toBe('cursor-2');
    });

    it('keeps cursor and request shapes protocol-safe', () => {
        const request = {
            limit: 50,
            encodedCursor: 'opaque',
        } satisfies PageRequest;

        const cursor = {
            kind: 'commitHistory',
            repositoryId: 'repo',
            worktreeId: 'worktree',
            queryHash: 'query',
            anchor: 'commit',
            snapshot: 'refs',
            direction: 'forward',
        } satisfies PageCursor;

        expect(request.limit).toBe(50);
        expect(cursor.direction).toBe('forward');
    });
});
