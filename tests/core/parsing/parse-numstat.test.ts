import { describe, expect, it } from 'vitest';
import { parseNumstat } from '@core/parsing/parse-numstat';

describe('parseNumstat', () => {
    it('handles empty output and null separators', () => {
        expect(parseNumstat('')).toEqual([]);
        expect(parseNumstat('2\t1\tfile.ts\0')).toEqual([{ filePath: 'file.ts', additions: 2, deletions: 1 }]);
    });
    it('preserves special paths and unicode and recognizes binary files and renames', () => {
        expect(parseNumstat('0\t0\t\0old\tfile.ts\0新しい\nfile.ts\0-\t-\timage.bin\0')).toEqual([
            { filePath: '新しい\nfile.ts', additions: 0, deletions: 0 },
            { filePath: 'image.bin', additions: null, deletions: null },
        ]);
    });
    it('rejects malformed data', () => { expect(() => parseNumstat('invalid\0')).toThrow(); });
});
