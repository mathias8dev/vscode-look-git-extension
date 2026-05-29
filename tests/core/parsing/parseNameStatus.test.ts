import { describe, expect, it } from 'vitest';
import { parseNameStatusZ } from '../../../src/core/parsing/parseNameStatus';
import { expectItem } from '../../helpers/assertions';

describe('parseNameStatusZ', () => {
    it('returns empty array for empty output', () => {
        expect(parseNameStatusZ('')).toEqual([]);
    });

    it('parses a modified file', () => {
        const output = 'M\0src/index.ts\0';
        const result = parseNameStatusZ(output);
        expect(result).toEqual([{ status: 'M', filePath: 'src/index.ts', origPath: undefined, parentHash: undefined }]);
    });

    it('parses an added file', () => {
        const output = 'A\0new.ts\0';
        const result = parseNameStatusZ(output);
        expect(expectItem(result, 0).status).toBe('A');
    });

    it('parses a deleted file', () => {
        const output = 'D\0old.ts\0';
        const result = parseNameStatusZ(output);
        expect(expectItem(result, 0).status).toBe('D');
    });

    it('parses a renamed file (R status has origPath before newPath)', () => {
        const output = 'R\0old name.ts\0new name.ts\0';
        const result = parseNameStatusZ(output);
        expect(result).toEqual([{ status: 'R', filePath: 'new name.ts', origPath: 'old name.ts', parentHash: undefined }]);
    });

    it('parses a copied file (C status)', () => {
        const output = 'C\0source.ts\0dest.ts\0';
        const result = parseNameStatusZ(output);
        const copied = expectItem(result, 0);
        expect(copied.status).toBe('C');
        expect(copied.origPath).toBe('source.ts');
        expect(copied.filePath).toBe('dest.ts');
    });

    it('attaches parentHash when provided', () => {
        const result = parseNameStatusZ('M\0file.ts\0', 'abc123');
        expect(expectItem(result, 0).parentHash).toBe('abc123');
    });

    it('deduplicates identical paths', () => {
        const output = 'M\0file.ts\0M\0file.ts\0';
        const result = parseNameStatusZ(output);
        expect(result).toHaveLength(1);
    });

    it('handles multiple files in one output', () => {
        const output = 'A\0a.ts\0M\0b.ts\0D\0c.ts\0';
        const result = parseNameStatusZ(output);
        expect(result).toHaveLength(3);
        expect(result.map((f) => f.status)).toEqual(['A', 'M', 'D']);
    });
});
