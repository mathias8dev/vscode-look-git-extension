import { describe, expect, it } from 'vitest';
import { parsePorcelainStatus, parsePorcelainV2Status, detectConflictStateFromFiles, summarizePorcelainStatus } from '@core/parsing/parse-status';
import { expectItem } from '@tests/helpers/assertions';

describe('parsePorcelainStatus', () => {
    it('returns empty buckets for empty output', () => {
        const result = parsePorcelainStatus('');
        expect(result.staged).toHaveLength(0);
        expect(result.unstaged).toHaveLength(0);
        expect(result.conflicts).toHaveLength(0);
    });

    it('places a staged file in staged', () => {
        // Format: XY PATH — X='M'(staged modified) Y=' '(clean work-tree) PATH
        const output = 'M  staged.ts\0';
        const result = parsePorcelainStatus(output);
        expect(result.staged).toHaveLength(1);
        const staged = expectItem(result.staged, 0);
        expect(staged.filePath).toBe('staged.ts');
        expect(staged.indexStatus).toBe('M');
    });

    it('places an untracked file in unstaged', () => {
        const output = '?? new.ts\0';
        const result = parsePorcelainStatus(output);
        expect(result.unstaged).toHaveLength(1);
        expect(expectItem(result.unstaged, 0).filePath).toBe('new.ts');
    });

    it('places a modified unstaged file in unstaged', () => {
        // X=' '(clean index) Y='M'(work-tree modified)
        const output = ' M dirty.ts\0';
        const result = parsePorcelainStatus(output);
        expect(result.unstaged).toHaveLength(1);
    });

    it('places a conflicted file (UU) in conflicts', () => {
        const output = 'UU conflict.ts\0';
        const result = parsePorcelainStatus(output);
        expect(result.conflicts).toHaveLength(1);
        expect(result.staged).toHaveLength(0);
        expect(result.unstaged).toHaveLength(0);
    });

    it('marks submodule entries as isSubmodule:true', () => {
        const output = 'M  sub\0';
        const submodulePaths = new Set(['sub']);
        const result = parsePorcelainStatus(output, submodulePaths);
        expect(expectItem(result.staged, 0).isSubmodule).toBe(true);
    });

    it('parses renamed file with origPath', () => {
        // Rename: X='R'(rename staged) Y=' ' then new path\0 then orig path\0
        const output = 'R  new.ts\0old.ts\0';
        const result = parsePorcelainStatus(output);
        const renamed = expectItem(result.staged, 0);
        expect(renamed.filePath).toBe('new.ts');
        expect(renamed.origPath).toBe('old.ts');
    });
});

describe('parsePorcelainV2Status', () => {
    it('returns empty buckets and ignores headers, ignored files, and invalid records', () => {
        const empty = { staged: [], unstaged: [], conflicts: [] };
        expect(parsePorcelainV2Status('')).toEqual(empty);
        expect(parsePorcelainV2Status('# branch.head main\0! ignored.txt\0invalid\0\0')).toEqual(empty);
    });

    it('keeps both staged and unstaged states without treating dot as a status', () => {
        const result = parsePorcelainV2Status([
            '1 M. N... 100644 100644 100644 abc def staged.ts',
            '1 .M N... 100644 100644 100644 abc def dirty.ts',
            '1 MM N... 100644 100644 100644 abc def both.ts',
            '? new.ts',
            '',
        ].join('\0'));
        expect(result.staged.map((entry) => entry.filePath)).toEqual(['staged.ts', 'both.ts']);
        expect(result.unstaged.map((entry) => entry.filePath)).toEqual(['dirty.ts', 'both.ts', 'new.ts']);
        expect(result.staged[0]).toMatchObject({ indexStatus: 'M', workTreeStatus: ' ' });
        expect(result.unstaged[0]).toMatchObject({ indexStatus: ' ', workTreeStatus: 'M' });
        expect(result.unstaged[2]).toMatchObject({ indexStatus: '?', workTreeStatus: '?' });
    });

    it.each(['R.', 'C.'])('parses %s paths separated by null bytes without consuming the next entry', (xy) => {
        const result = parsePorcelainV2Status(`2 ${xy} N... 100644 100644 100644 abc def R100 new name.ts\0old name.ts\0? other.ts\0`);
        expect(result.staged[0]).toMatchObject({ filePath: 'new name.ts', origPath: 'old name.ts' });
        expect(result.unstaged[0]?.filePath).toBe('other.ts');
    });

    it.each(['AA', 'DD', 'AU', 'UA', 'DU', 'UD', 'UU'])('classifies %s as a conflict', (xy) => {
        const result = parsePorcelainV2Status(`u ${xy} N... 100644 100644 100644 100644 abc def ghi conflict.ts\0`);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0]?.filePath).toBe('conflict.ts');
        expect(result.staged).toEqual([]);
        expect(result.unstaged).toEqual([]);
    });

    it('preserves whitespace, unicode, and special path characters', () => {
        const filePath = ' dir/é > ?\tline\nname.ts ';
        const result = parsePorcelainV2Status(`1 .M N... 100644 100644 100644 abc def ${filePath}\0? ${filePath}\0`);
        expect(result.unstaged.map((entry) => entry.filePath)).toEqual([filePath, filePath]);
    });

    it('recognizes dirty, removed, and conflicted gitlinks from their metadata', () => {
        const result = parsePorcelainV2Status([
            '1 .M S.M. 160000 160000 160000 abc def dirty',
            '1 D. N... 160000 000000 000000 abc def removed',
            'u UU N... 160000 160000 160000 000000 abc def ghi conflict',
            '1 .M N... 100644 100644 100644 abc def regular.txt',
            '',
        ].join('\0'));
        expect(result.unstaged[0]?.isSubmodule).toBe(true);
        expect(result.staged[0]?.isSubmodule).toBe(true);
        expect(result.conflicts[0]?.isSubmodule).toBe(true);
        expect(result.unstaged[1]?.isSubmodule).toBeUndefined();
    });
});

describe('summarizePorcelainStatus', () => {
    it('counts unstaged files without losing leading status spaces', () => {
        const output = ' M dirty.ts\0M  staged.ts\0?? new.ts\0UU conflict.ts\0';

        expect(summarizePorcelainStatus(output)).toEqual({
            staged: 1,
            unstaged: 1,
            untracked: 1,
            conflicts: 1,
        });
    });
});

describe('detectConflictStateFromFiles', () => {
    it('detects merge state from MERGE_HEAD', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'MERGE_HEAD', 'index'])).toBe('merge');
    });

    it('detects rebase state from rebase-merge directory', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'rebase-merge'])).toBe('rebase');
    });

    it('detects rebase state from rebase-apply directory', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'rebase-apply'])).toBe('rebase');
    });

    it('keeps rebase as the active operation while recreating a merge', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'MERGE_HEAD', 'rebase-merge'])).toBe('rebase');
    });

    it('returns none for clean state', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'index', 'config'])).toBe('none');
    });
});
