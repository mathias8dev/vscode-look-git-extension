import { describe, expect, it } from 'vitest';
import { parsePorcelainStatus, detectConflictStateFromFiles, summarizePorcelainStatus } from '@core/parsing/parseStatus';
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

    it('returns none for clean state', () => {
        expect(detectConflictStateFromFiles(['HEAD', 'index', 'config'])).toBe('none');
    });
});
