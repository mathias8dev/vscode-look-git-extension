import { describe, expect, it } from 'vitest';
import { parseDiffRawZ } from '@core/parsing/parse-diff-raw';

describe('parseDiffRawZ', () => {
    it('handles empty output', () => { expect(parseDiffRawZ('')).toEqual([]); });
    it('handles null separators, rename paths, special characters and unicode', () => {
        expect(parseDiffRawZ(':100644 100644 aaaa bbbb R100\0old\tfile.ts\0新しい\nfile.ts\0')).toEqual([
            { status: 'R', filePath: '新しい\nfile.ts', origPath: 'old\tfile.ts', oldRevision: 'aaaa', newRevision: 'bbbb' },
        ]);
    });
    it('detects gitlinks from either side including deleted submodules', () => {
        const files = parseDiffRawZ(':160000 000000 aaaa 0000 D\0modules/a\0:100644 160000 bbbb cccc T\0modules/b\0');
        expect(files.every(file => file.isSubmodule)).toBe(true);
    });
    it('rejects incomplete records', () => { expect(() => parseDiffRawZ(':100644 100644 aaaa bbbb R100\0old\0')).toThrow(); });
});
