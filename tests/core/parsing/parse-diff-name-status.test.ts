import { describe, expect, it } from 'vitest';
import { parseDiffNameStatus } from '../../../src/core/parsing/parse-diff-name-status';

describe('parseDiffNameStatus', () => {
    it('returns an empty array for empty output', () => {
        expect(parseDiffNameStatus('')).toEqual([]);
    });

    it('parses null-byte separated added, modified, and deleted paths', () => {
        expect(parseDiffNameStatus('A\0new.ts\0M\0src/app.ts\0D\0old.ts\0')).toEqual([
            { status: 'A', filePath: 'new.ts' },
            { status: 'M', filePath: 'src/app.ts' },
            { status: 'D', filePath: 'old.ts' },
        ]);
    });

    it('parses renamed and copied paths with their original paths', () => {
        expect(parseDiffNameStatus('R100\0old name.ts\0new name.ts\0C075\0base.ts\0copy.ts\0')).toEqual([
            { status: 'R', origPath: 'old name.ts', filePath: 'new name.ts' },
            { status: 'C', origPath: 'base.ts', filePath: 'copy.ts' },
        ]);
    });

    it('handles unicode and special path characters', () => {
        expect(parseDiffNameStatus('M\0docs/résumé [draft].md\0A\0src/你好.ts\0')).toEqual([
            { status: 'M', filePath: 'docs/résumé [draft].md' },
            { status: 'A', filePath: 'src/你好.ts' },
        ]);
    });
});
