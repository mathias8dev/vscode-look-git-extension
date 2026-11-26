import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createTempGitRepo } from '@tests/helpers/git-repo';

describe('textconv file content against real Git repositories', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

    function fixture() {
        const repo = createTempGitRepo();
        cleanups.push(() => repo.cleanup());
        const repository = new RuntimeGitRepository({
            repoId: repo.cwd, cwd: repo.cwd, gitDir: path.join(repo.cwd, '.git'), kind: 'main', label: 'Textconv fixture',
        });
        const worktree = new RuntimeWorktree({
            repoId: repo.cwd, worktreeId: repo.cwd, path: repo.cwd, gitDir: path.join(repo.cwd, '.git'),
            repositoryKind: 'main', isMain: true, head: '', branch: 'main', dirty: false,
        });
        const driverPath = path.join(repo.cwd, '.git', 'textconv.cjs');
        repo.write('.git/textconv.cjs', [
            "const fs = require('node:fs');",
            "const stored = fs.readFileSync(process.argv[2], 'utf8');",
            "process.stdout.write(Buffer.from(stored.slice('\\0encoded:'.length), 'base64'));",
        ].join('\n'));
        const nodePath = process.execPath.replace(/\\/g, '/');
        repo.git(['config', 'diff.lookgit-test.textconv', `"${nodePath}" "${driverPath.replace(/\\/g, '/')}"`]);
        repo.write('.gitattributes', '*.secret diff=lookgit-test\n');
        return { repo, repository, worktree };
    }

    const filePath = 'secrets/équipe [1].secret';
    const encode = (content: string) => `\0encoded:${Buffer.from(content).toString('base64')}\n`;

    it('reads converted revisions and index content without trimming or changing stored bytes', async () => {
        const { repo, repository, worktree } = fixture();
        const before = '  ancienne valeur éè\n\n';
        const staged = '  staged value\n\n';
        repo.write(filePath, encode(before));
        repo.write('plain.txt', '  plain\n\n');
        repo.commit('Initial content');
        repo.write(filePath, encode(staged));
        repo.git(['add', '--', filePath]);
        repo.write(filePath, encode('unstaged value\n'));
        const status = repo.git(['status', '--porcelain']);

        await expect(repository.getFileAtRevision(filePath, 'HEAD')).resolves.toEqual(Buffer.from(before));
        await expect(worktree.getFileAtRevision(filePath, 'HEAD')).resolves.toEqual(Buffer.from(before));
        await expect(worktree.getFileFromIndex(filePath)).resolves.toEqual(Buffer.from(staged));
        await expect(repository.getFileAtRevision('plain.txt', 'HEAD')).resolves.toEqual(Buffer.from('  plain\n\n'));
        expect(repo.git(['show', `HEAD:${filePath}`])).toBe(encode(before));
        expect(repo.git(['show', `:${filePath}`])).toBe(encode(staged));
        expect(repo.git(['status', '--porcelain'])).toBe(status);
        expect(fs.readFileSync(path.join(repo.cwd, filePath), 'utf8')).toBe(encode('unstaged value\n'));
    });

    it('converts historical renamed paths and each stash revision independently', async () => {
        const { repo, repository } = fixture();
        const initial = repo.commitFile(filePath, encode('before rename\n'), 'Initial content');
        const renamedPath = 'secrets/renamed.secret';
        repo.git(['mv', '--', filePath, renamedPath]);
        const renamed = repo.commit('Rename file');
        repo.write(renamedPath, encode('staged stash\n'));
        repo.git(['add', '--', renamedPath]);
        repo.write(renamedPath, encode('working stash\n'));
        repo.git(['stash', 'push', '-m', 'Converted content']);

        await expect(repository.getFileAtRevision(filePath, initial)).resolves.toEqual(Buffer.from('before rename\n'));
        await expect(repository.getFileAtRevision(renamedPath, renamed)).resolves.toEqual(Buffer.from('before rename\n'));
        await expect(repository.getFileAtRevision(renamedPath, 'stash@{0}^1')).resolves.toEqual(Buffer.from('before rename\n'));
        await expect(repository.getFileAtRevision(renamedPath, 'stash@{0}^2')).resolves.toEqual(Buffer.from('staged stash\n'));
        await expect(repository.getFileAtRevision(renamedPath, 'stash@{0}')).resolves.toEqual(Buffer.from('working stash\n'));
    });

    it('converts comparison patches while preserving Git statistics and ordinary binary detection', async () => {
        const { repo, repository } = fixture();
        repo.write('.gitattributes', '*.secret diff=lookgit-test\nimage.bin diff=missing-driver\n');
        repo.writeBuffer('image.bin', Buffer.from([0, 1, 2, 3]));
        const initial = repo.commitFile(filePath, encode('first line\nsecond line\n'), 'Initial content');
        repo.writeBuffer('image.bin', Buffer.from([0, 1, 2, 4]));
        const changed = repo.commitFile(filePath, encode('first line\nupdated line\nthird line\n'), 'Update content');

        const files = await repository.listChangedFiles(initial, changed, { limit: 10 });
        expect(files.items).toContainEqual(expect.objectContaining({ filePath, additions: null, deletions: null }));
        expect(files.items).toContainEqual(expect.objectContaining({ filePath: 'image.bin', additions: null, deletions: null }));
        const patch = await repository.compareFiles(initial, changed, filePath);
        expect(patch).toContain('-second line\n+updated line\n+third line');
        expect(patch).not.toContain('encoded:');
        await expect(repository.compareFiles(initial, changed, 'image.bin')).resolves.toContain('Binary files');
    });

    it('converts base, ours and theirs using the conflicted file attributes', async () => {
        const { repo, worktree } = fixture();
        repo.commitFile(filePath, encode('base\n\n'), 'Base');
        repo.git(['checkout', '-q', '-b', 'incoming']);
        repo.commitFile(filePath, encode('theirs\n\n'), 'Incoming');
        repo.git(['checkout', '-q', 'main']);
        repo.commitFile(filePath, encode('ours\n\n'), 'Current');
        expect(() => repo.git(['merge', '--no-edit', 'incoming'])).toThrow();
        const unmerged = repo.git(['ls-files', '-u']);

        await expect(worktree.getConflictStages(filePath)).resolves.toEqual({
            base: Buffer.from('base\n\n'), ours: Buffer.from('ours\n\n'), theirs: Buffer.from('theirs\n\n'),
        });
        expect(repo.git(['ls-files', '-u'])).toBe(unmerged);
        await expect(worktree.getConflictStages('absent.secret')).resolves.toEqual({ base: new Uint8Array(), ours: new Uint8Array(), theirs: new Uint8Array() });
    });

    it('reports conversion failures and cancellation instead of falling back to stored content', async () => {
        const { repo, repository, worktree } = fixture();
        repo.commitFile(filePath, encode('content\n'), 'Initial content');
        repo.write('.git/textconv.cjs', "process.stderr.write('conversion failed'); process.exit(1);\n");

        await expect(repository.getFileAtRevision(filePath, 'HEAD')).rejects.toThrow();
        await expect(worktree.getFileFromIndex(filePath)).rejects.toThrow();
        const controller = new AbortController();
        controller.abort();
        await expect(repository.getFileAtRevision(filePath, 'HEAD', controller.signal)).rejects.toThrow();
    });

    it.skipIf(spawnSync('git-crypt', ['--version']).status !== 0)('decrypts actual git-crypt revisions and the index in an unlocked repository', async () => {
        const { repo, repository, worktree } = fixture();
        repo.git(['crypt', 'init']);
        repo.write('.gitattributes', '*.secret filter=git-crypt diff=git-crypt\n');
        const before = '  example secret before commit with unicode éè\n\n';
        const after = '  example secret after commit with unicode éè\n\n';
        const initial = repo.commitFile(filePath, before, 'Encrypted initial content');
        const changed = repo.commitFile(filePath, after, 'Encrypted update');

        expect(repo.git(['show', `${initial}:${filePath}`])).toMatch(/^\0GITCRYPT\0/);
        expect(repo.git(['show', `${changed}:${filePath}`])).toMatch(/^\0GITCRYPT\0/);
        await expect(repository.getFileAtRevision(filePath, initial)).resolves.toEqual(Buffer.from(before));
        await expect(repository.getFileAtRevision(filePath, changed)).resolves.toEqual(Buffer.from(after));
        await expect(worktree.getFileFromIndex(filePath)).resolves.toEqual(Buffer.from(after));
        const files = await repository.listChangedFiles(initial, changed, { limit: 10 });
        expect(files.items).toContainEqual(expect.objectContaining({ filePath, additions: null, deletions: null }));
        const patch = await repository.compareFiles(initial, changed, filePath);
        expect(patch).toContain(`-${before.trimEnd()}\n`);
        expect(patch).toContain(`+${after.trimEnd()}\n`);
        expect(fs.readFileSync(path.join(repo.cwd, filePath), 'utf8')).toBe(after);
        expect(repo.git(['status', '--porcelain'])).toBe('');
    });
});
