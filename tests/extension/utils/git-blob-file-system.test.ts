import { afterEach, describe, expect, it } from 'vitest';
import { gitBlobUri, registerGitBlobFileSystemProvider } from '@extension/utils/git-blob-file-system';
import { workspace, resetMockVscode, Uri } from '@tests/mocks/vscode';

describe('Git blob file system', () => {
    afterEach(resetMockVscode);

    it('preserves bytes and gives each snapshot a separate URI at the original path', async () => {
        const registration = registerGitBlobFileSystemProvider();
        try {
            const content = Buffer.from([0xff, 0xfe, 0xe9, 0, 0, 0]);
            const first = gitBlobUri('HEAD', '/repo/secrets/file.txt', 'left', content);
            const second = gitBlobUri('HEAD', '/repo/secrets/file.txt', 'left', Buffer.from('other'));
            expect(first.path).toBe('/repo/secrets/file.txt');
            expect(first.toString()).not.toBe(second.toString());
            await expect(workspace.fs.readFile(first)).resolves.toEqual(new Uint8Array(content));
            await expect(workspace.fs.readFile(second)).resolves.toEqual(new Uint8Array(Buffer.from('other')));
        } finally { registration.dispose(); }
    });

    it('provides byte sizes, rejects writes and reports missing snapshots instead of an empty file', () => {
        const registration = registerGitBlobFileSystemProvider();
        try {
            const uri = gitBlobUri('HEAD', '/repo/image.png', 'right', Buffer.from([0, 0xff, 0x80]));
            const provider = workspace.fileSystemProviders.get('lookgit-blob');
            expect(provider?.stat(uri)).toMatchObject({ size: 3, permissions: 1 });
            expect(() => provider?.writeFile(uri)).toThrow(expect.objectContaining({ code: 'NoPermissions' }));
            expect(() => provider?.delete(uri)).toThrow(expect.objectContaining({ code: 'NoPermissions' }));
            expect(() => provider?.rename(uri)).toThrow(expect.objectContaining({ code: 'NoPermissions' }));
            expect(() => provider?.readFile(Uri.parse('lookgit-blob:/missing'))).toThrow(expect.objectContaining({ code: 'FileNotFound' }));
        } finally { registration.dispose(); }
    });

    it('reuses identical snapshots and isolates their contents from caller mutations', async () => {
        const registration = registerGitBlobFileSystemProvider();
        try {
            const bytes = Buffer.from('before\n');
            const first = gitBlobUri('HEAD', '/repo/file.txt', 'left', bytes);
            const repeated = gitBlobUri('HEAD', '/repo/file.txt', 'left', Buffer.from('before\n'));
            expect(first.toString()).toBe(repeated.toString());
            bytes.fill(0);
            const read = await workspace.fs.readFile(first);
            expect(read).toEqual(new Uint8Array(Buffer.from('before\n')));
            read.fill(0);
            await expect(workspace.fs.readFile(first)).resolves.toEqual(new Uint8Array(Buffer.from('before\n')));
            const updated = gitBlobUri('HEAD', '/repo/file.txt', 'left', Buffer.from('after\n'));
            expect(updated.toString()).not.toBe(first.toString());
            const otherRepository = gitBlobUri('HEAD', '/other/file.txt', 'left', Buffer.from('before\n'));
            expect(otherRepository.toString()).not.toBe(first.toString());
        } finally { registration.dispose(); }
    });
});
