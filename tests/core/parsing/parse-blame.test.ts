import { describe, expect, it } from 'vitest';
import { parseBlame } from '@core/parsing/parse-blame';

describe('parseBlame', () => {
    it('returns no lines for empty output', () => {
        expect(parseBlame('')).toEqual([]);
    });

    it('parses line porcelain blame records', () => {
        const raw = [
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1',
            'author Alice Example',
            'author-mail <alice@example.com>',
            'author-time 1704067200',
            'author-tz +0000',
            'summary add first line',
            'filename src/app.ts',
            '\tconst a = 1;',
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2 2 1',
            'author Bob Example',
            'author-time 1704153600',
            'summary add second line',
            'filename src/app.ts',
            '\tconst b = 2;',
            '',
        ].join('\n');

        expect(parseBlame(raw)).toEqual([
            {
                line: 1,
                commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                author: 'Alice Example',
                authorTime: 1704067200,
                summary: 'add first line',
            },
            {
                line: 2,
                commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                author: 'Bob Example',
                authorTime: 1704153600,
                summary: 'add second line',
            },
        ]);
    });

    it('handles crlf output and unicode author names', () => {
        const raw = [
            'cccccccccccccccccccccccccccccccccccccccc 4 7 1',
            'author Chloé Example',
            'author-time 1704240000',
            'summary unicode author',
            'filename docs/readme.md',
            '\tbonjour',
            '',
        ].join('\r\n');

        expect(parseBlame(raw)).toEqual([{
            line: 7,
            commit: 'cccccccccccccccccccccccccccccccccccccccc',
            author: 'Chloé Example',
            authorTime: 1704240000,
            summary: 'unicode author',
        }]);
    });
});
