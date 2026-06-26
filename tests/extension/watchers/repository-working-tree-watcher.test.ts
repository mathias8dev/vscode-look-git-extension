import { describe, expect, it } from 'vitest';
import { isWorkingTreeChangePath } from '@extension/watchers/repository-working-tree-watcher';

describe('isWorkingTreeChangePath', () => {
    it('accepts files inside the repository working tree', () => {
        expect(isWorkingTreeChangePath('/repo', '/repo/src/file.ts')).toBe(true);
        expect(isWorkingTreeChangePath('/repo', '/repo/nested/dir/file.ts')).toBe(true);
    });

    it('ignores git metadata and paths outside the repository', () => {
        expect(isWorkingTreeChangePath('/repo', '/repo/.git/index')).toBe(false);
        expect(isWorkingTreeChangePath('/repo', '/repo/.git/refs/heads/main')).toBe(false);
        expect(isWorkingTreeChangePath('/repo', '/repo')).toBe(false);
        expect(isWorkingTreeChangePath('/repo', '/other/file.ts')).toBe(false);
    });
});
