import { describe, expect, it } from 'vitest';
import { parseTagList } from '@core/parsing/parse-tag-list';

describe('parseTagList', () => {
    it('handles empty output', () => expect(parseTagList('')).toEqual([]));
    it('separates tag objects and target commits with null bytes', () => {
        expect(parseTagList('v1\0abc123\0\nv2\0def456\0abc123\n')).toEqual([
            { name: 'v1', objectHash: 'abc123', hash: 'abc123' },
            { name: 'v2', objectHash: 'def456', hash: 'abc123' },
        ]);
    });
    it('preserves special characters and unicode names with CRLF output', () => {
        expect(parseTagList('releases/été-1.0+build\0abc123\0\r\n')[0]?.name).toBe('releases/été-1.0+build');
    });
});
