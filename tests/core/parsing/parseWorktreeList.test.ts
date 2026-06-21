import { describe, expect, it } from 'vitest';
import { parseWorktreeList } from '@core/parsing/parseWorktreeList';
import { expectItem } from '@tests/helpers/assertions';

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
        const main = expectItem(result, 0);
        expect(main.isMain).toBe(true);
        expect(main.isDetached).toBe(false);
        expect(main.isLocked).toBe(false);
        expect(main.path).toBe('/repo');
        expect(main.head).toBe('abc1234567890abcdef');
        expect(main.branch).toBe('refs/heads/main');
    });

    it('parses linked worktree with isMain:false', () => {
        const output = MAIN_STANZA + '\n\nworktree /wt/feature\nHEAD def456\nbranch refs/heads/feature\n\n';
        const result = parseWorktreeList(output);
        expect(result).toHaveLength(2);
        const linked = expectItem(result, 1);
        expect(linked.isMain).toBe(false);
        expect(linked.path).toBe('/wt/feature');
        expect(linked.branch).toBe('refs/heads/feature');
    });

    it('marks detached worktree as isDetached:true with no branch', () => {
        const output = MAIN_STANZA + '\n\nworktree /wt/detached\nHEAD abc123\ndetached\n\n';
        const result = parseWorktreeList(output);
        const detached = expectItem(result, 1);
        expect(detached.isDetached).toBe(true);
        expect(detached.branch).toBeUndefined();
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

    it('parses locked worktrees with a reason', () => {
        const output = MAIN_STANZA + '\n\nworktree /wt/locked\nHEAD def456\nbranch refs/heads/locked\nlocked needs review\n\n';
        const result = parseWorktreeList(output);
        const locked = expectItem(result, 1);

        expect(locked.isLocked).toBe(true);
        expect(locked.lockReason).toBe('needs review');
    });

    it('skips empty stanzas', () => {
        const output = '\n\n' + MAIN_STANZA + '\n\n\n\n';
        const result = parseWorktreeList(output);
        expect(result).toHaveLength(1);
    });
});
