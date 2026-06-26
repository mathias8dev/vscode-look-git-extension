import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { isWorkingTreeChangePath } from '@extension/watchers/repository-working-tree-watcher';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';

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

    it('accepts filesystem events reported through a canonical path when the repository path is linked', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-watch-'));
        const linked = path.join(os.tmpdir(), `look-git-watch-link-${process.pid}-${Date.now()}`);
        try {
            const repo = path.join(root, 'repo');
            const file = path.join(repo, 'src', 'file.ts');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, 'export const value = true;\n');
            fs.symlinkSync(repo, linked, process.platform === 'win32' ? 'junction' : 'dir');

            expect(isWorkingTreeChangePath(linked, file)).toBe(true);
        } finally {
            removeDirSyncWithRetry(linked);
            removeDirSyncWithRetry(root);
        }
    });
});
