import { describe, expect, it } from 'vitest';
import { parseCommitLog, parseGraphLog, LOG_FIELD_SEP, LOG_RECORD_SEP } from '../../../src/core/parsing/parseLog';
import { expectItem } from '../../helpers/assertions';

function makeLogRecord(fields: string[]): string {
    return fields.join(LOG_FIELD_SEP);
}

function makeLogOutput(records: string[]): string {
    return records.join(LOG_RECORD_SEP);
}

describe('parseCommitLog', () => {
    it('returns empty array for empty output', () => {
        expect(parseCommitLog('')).toEqual([]);
    });

    it('parses a single commit record', () => {
        const output = makeLogOutput([
            makeLogRecord(['abc1234567890', 'abc1234', 'initial commit', 'Alice', 'alice@example.com', '2024-01-01T00:00:00Z', '']),
        ]);
        const result = parseCommitLog(output);
        expect(result).toHaveLength(1);
        expect(expectItem(result, 0)).toMatchObject({ hash: 'abc1234567890', shortHash: 'abc1234', message: 'initial commit', authorName: 'Alice', parentHashes: [] });
    });

    it('parses multiple parent hashes', () => {
        const output = makeLogOutput([
            makeLogRecord(['merge123', 'm123', 'merge commit', 'Bob', 'b@e.com', '2024-01-02T00:00:00Z', 'parent1 parent2']),
        ]);
        const result = parseCommitLog(output);
        expect(expectItem(result, 0).parentHashes).toEqual(['parent1', 'parent2']);
    });

    it('handles unicode in messages and author names', () => {
        const output = makeLogOutput([
            makeLogRecord(['abc', 'abc', 'feat: 你好 / résumé', 'Élise Müller', 'e@e.com', '2024-01-01T00:00:00Z', '']),
        ]);
        const result = parseCommitLog(output);
        const commit = expectItem(result, 0);
        expect(commit.message).toBe('feat: 你好 / résumé');
        expect(commit.authorName).toBe('Élise Müller');
    });

    it('parses multiple records separated by record separator', () => {
        const output = makeLogOutput([
            makeLogRecord(['aaa', 'aaa', 'first', 'A', 'a@a.com', '2024-01-01T00:00:00Z', '']),
            makeLogRecord(['bbb', 'bbb', 'second', 'B', 'b@b.com', '2024-01-02T00:00:00Z', 'aaa']),
        ]);
        const result = parseCommitLog(output);
        expect(result).toHaveLength(2);
        expect(expectItem(result, 1).parentHashes).toEqual(['aaa']);
    });

    it('skips blank records', () => {
        const output = '\x1e\x1e' + makeLogRecord(['aaa', 'aaa', 'msg', 'A', 'a@a.com', '2024-01-01T00:00:00Z', '']);
        const result = parseCommitLog(output);
        expect(result).toHaveLength(1);
    });
});

describe('parseGraphLog', () => {
    it('parses refs from field 7', () => {
        const output = makeLogOutput([
            makeLogRecord(['abc', 'abc', 'msg', 'A', 'a@a.com', '2024-01-01T00:00:00Z', '', 'HEAD -> main, origin/main']),
        ]);
        const result = parseGraphLog(output);
        expect(expectItem(result, 0).refs).toEqual(['HEAD -> main', 'origin/main']);
    });

    it('returns empty refs array when field 7 is missing', () => {
        const output = makeLogOutput([
            makeLogRecord(['abc', 'abc', 'msg', 'A', 'a@a.com', '2024-01-01T00:00:00Z', '']),
        ]);
        const result = parseGraphLog(output);
        expect(expectItem(result, 0).refs).toEqual([]);
    });
});
