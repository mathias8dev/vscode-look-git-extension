import { describe, expect, it } from 'vitest';
import { GitCommit } from '@core/git/domain/GitCommit';

describe('GitCommit', () => {
    it('keeps commit fields immutable by construction', () => {
        const commit = new GitCommit({
            hash: '0123456789abcdef',
            shortHash: '0123456',
            message: 'Initial commit',
            authorName: 'Ada',
            authorEmail: 'ada@example.test',
            authorDate: '2026-06-20T10:00:00.000Z',
            parentHashes: ['parent'],
            refs: ['main'],
        });

        expect(commit).toMatchObject({
            hash: '0123456789abcdef',
            shortHash: '0123456',
            message: 'Initial commit',
            authorName: 'Ada',
            authorEmail: 'ada@example.test',
            authorDate: '2026-06-20T10:00:00.000Z',
            parentHashes: ['parent'],
            refs: ['main'],
        });
    });

    it('defaults refs to an empty list', () => {
        const commit = new GitCommit({
            hash: 'hash',
            shortHash: 'short',
            message: 'Message',
            authorName: 'Ada',
            authorEmail: 'ada@example.test',
            authorDate: '2026-06-20T10:00:00.000Z',
            parentHashes: [],
        });

        expect(commit.refs).toEqual([]);
    });
});
