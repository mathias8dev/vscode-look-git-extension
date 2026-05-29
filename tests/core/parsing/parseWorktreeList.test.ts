import { describe, expect, it } from 'vitest';
import { parseWorktreeList } from '../../../src/core/parsing/parseWorktreeList';

const MAIN_STANZA = `worktree /repo
HEAD abc1234567890abcdef
branch refs/heads/main`;

describe('parseWorktreeList', () => {
    it('returns empty array for empty output', () => {
        expect(parseWorktreeList('')).toEqual([]);
    });

    it('parses main worktree as isMain:true', () => {
        const result = parseWorktreeList(MAIN_STANZA + '\n\n');
        expect(result).toHaveLength(1);
        expect(result[0].isMain).toBe(true);
        expect(result[0].isDetached).toBe(false);
        expect(result[0].path).toBe('/repo');
        expect(result[0].head).toBe('abc1234567890abcdef');
        expect(result[0].branch).toBe('refs/heads/main');
    });

    it('parses linked worktree with isMain:false', () => {
        const output = MAIN_STANZA + '\n\nworktree /wt/feature\nHEAD def456\nbranch refs/heads/feature\n\n';
        const result = parseWorktreeList(output);
        expect(result).toHaveLength(2);
        expect(result[1].isMain).toBe(false);
        expect(result[1].path).toBe('/wt/feature');
        expect(result[1].branch).toBe('refs/heads/feature');
    });

    it('marks detached worktree as isDetached:true with no branch', () => {
        const output = MAIN_STANZA + '\n\nworktree /wt/detached\nHEAD abc123\ndetached\n\n';
        const result = parseWorktreeList(output);
        expect(result[1].isDetached).toBe(true);
        expect(result[1].branch).toBeUndefined();
    });

    it('handles multiple linked worktrees', () => {
        const output = [
            MAIN_STANZA,
            'worktree /wt/a\nHEAD a1\nbranch refs/heads/a',
            'worktree /wt/b\nHEAD b1\nbranch refs/heads/b',
        ].join('\n\n');
        const result = parseWorktreeList(output);
        expect(result).toHaveLength(3);
        expect(result.filter((w) => w.isMain)).toHaveLength(1);
    });

    it('skips empty stanzas', () => {
        const output = '\n\n' + MAIN_STANZA + '\n\n\n\n';
        const result = parseWorktreeList(output);
        expect(result).toHaveLength(1);
    });
});
