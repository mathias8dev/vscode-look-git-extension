import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { openChangesWithWorkingTree } from '@extension/commands/git-command-helpers';
import { registerGitBlobFileSystemProvider } from '@extension/utils/git-blob-file-system';
import { addLinkedWorktree, createTempGitRepo } from '@tests/helpers/git-repo';
import { commands, resetMockVscode } from '@tests/mocks/vscode';

describe('worktree comparison', () => {
    afterEach(resetMockVscode);

    it('loads changed files and their HEAD contents from the selected linked worktree', async () => {
        const repo = createTempGitRepo();
        let linked: ReturnType<typeof addLinkedWorktree> | undefined;
        const registration = registerGitBlobFileSystemProvider();
        try {
            repo.write('old.txt', 'renamed contents\n');
            repo.write('delete.txt', 'deleted contents\n');
            repo.commitFile('file.txt', 'main contents\n', 'Initial');
            linked = addLinkedWorktree(repo, 'feature');
            fs.writeFileSync(path.join(linked.worktreePath, 'file.txt'), 'feature committed contents\n');
            repo.git(['-C', linked.worktreePath, 'add', 'file.txt']);
            repo.git(['-C', linked.worktreePath, 'commit', '-qm', 'Feature contents']);
            fs.writeFileSync(path.join(linked.worktreePath, 'file.txt'), 'feature working contents\n');
            repo.git(['-C', linked.worktreePath, 'mv', 'old.txt', 'renamed.txt']);
            repo.git(['-C', linked.worktreePath, 'rm', 'delete.txt']);
            fs.writeFileSync(path.join(linked.worktreePath, 'added.txt'), 'added contents\n');
            repo.git(['-C', linked.worktreePath, 'add', 'added.txt']);
            const repository = new RuntimeGitRepository({ repoId: repo.cwd, cwd: repo.cwd, gitDir: path.join(repo.cwd, '.git'), kind: 'main', label: 'Main' });
            const worktree = new RuntimeWorktree({ repoId: repo.cwd, worktreeId: linked.worktreePath, path: linked.worktreePath, gitDir: path.join(repo.cwd, '.git'), repositoryKind: 'main', isMain: false, head: 'HEAD', branch: 'feature', dirty: true });

            await openChangesWithWorkingTree(repository, worktree, 'HEAD', 'Selected worktree');

            const call = commands.calls.find(call => call.command === 'vscode.changes');
            const resources = call?.args[1] as readonly (readonly [vscode.Uri, vscode.Uri, vscode.Uri])[]; // The native changes editor receives URI triples.
            expect(resources).toHaveLength(4);
            const resource = resources.find(([file]) => path.basename(file.path) === 'file.txt');
            if (!resource) { throw new Error('Expected a file diff.'); }
            expect(resource[0].fsPath.replace(/\\/g, '/')).toBe(path.join(linked.worktreePath, 'file.txt').replace(/\\/g, '/'));
            expect((await vscode.workspace.openTextDocument(resource[1])).getText()).toBe('feature committed contents\n');
            expect(fs.readFileSync(resource[2].fsPath, 'utf8')).toBe('feature working contents\n');
            const contents = await Promise.all(resources.map(async ([file, left, right]) => ({
                file: path.basename(file.path),
                left: (await vscode.workspace.openTextDocument(left)).getText(),
                right: (await vscode.workspace.openTextDocument(right)).getText(),
            })));
            expect(contents).toEqual(expect.arrayContaining([
                { file: 'added.txt', left: '', right: 'added contents\n' },
                { file: 'delete.txt', left: 'deleted contents\n', right: '' },
                { file: 'renamed.txt', left: 'renamed contents\n', right: 'renamed contents\n' },
            ]));
            expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
            expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
        } finally { registration.dispose(); linked?.cleanup(); repo.cleanup(); }
    });

    it('rejects a working directory belonging to another repository', async () => {
        const repo = createTempGitRepo();
        const other = createTempGitRepo();
        try {
            repo.commitFile('file.txt', 'main\n', 'Initial');
            other.commitFile('file.txt', 'other\n', 'Other');
            const repository = new RuntimeGitRepository({ repoId: repo.cwd, cwd: repo.cwd, gitDir: path.join(repo.cwd, '.git'), kind: 'main', label: 'Main' });
            await expect(repository.compareWithWorkingTree('HEAD', other.cwd, {})).rejects.toThrow('Unknown worktree');
        } finally { repo.cleanup(); other.cleanup(); }
    });
});
