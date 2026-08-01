import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoKind } from '@core/git/domain/repo-context';
import { isGitMetadataChangePath, isWorkingTreeChangePath, RepositoryGitWatcher, resolveGitMetadataRoots } from '@extension/watchers/repository-git-watcher';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';
import { RelativePattern, workspace } from '@tests/mocks/vscode';

describe('repository git watcher', () => {
    beforeEach(() => {
        workspace.reset();
    });

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

    it('watches working tree and git metadata changes for an open repository', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-repository-watch-'));
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
        const onDidChange = vi.fn();
        const watcher = new RepositoryGitWatcher(onDidChange);

        try {
            watcher.setContexts([{ id: 'repo', cwd: root, kind: RepoKind.Main, label: 'repo' }]);
            const workingTreeWatcher = relativeWatcher(root, '**');
            const gitRootWatcher = relativeWatcher(gitDir, '*');
            const refsWatcher = relativeWatcher(gitDir, 'refs/**');

            expect(workingTreeWatcher).toBeDefined();
            expect(gitRootWatcher).toBeDefined();
            expect(refsWatcher).toBeDefined();

            workingTreeWatcher?.fireDidChange(vscode.Uri.file(path.join(root, 'src', 'app.ts')));
            workingTreeWatcher?.fireDidChange(vscode.Uri.file(path.join(gitDir, 'index')));
            gitRootWatcher?.fireDidChange(vscode.Uri.file(path.join(gitDir, 'index')));
            refsWatcher?.fireDidCreate(vscode.Uri.file(path.join(gitDir, 'refs', 'heads', 'main')));

            expect(onDidChange).toHaveBeenCalledTimes(3);
        } finally {
            watcher.dispose();
            removeDirSyncWithRetry(root);
        }
    });

    it('resolves the actual git and common directories for linked worktrees and submodules', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-linked-watch-'));
        const worktree = path.join(root, 'worktree');
        const commonDir = path.join(root, 'main', '.git');
        const gitDir = path.join(commonDir, 'worktrees', 'feature');
        fs.mkdirSync(worktree, { recursive: true });
        fs.mkdirSync(gitDir, { recursive: true });
        fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.relative(worktree, gitDir)}\n`);
        fs.writeFileSync(path.join(gitDir, 'commondir'), '../..\n');

        try {
            expect(resolveGitMetadataRoots(worktree)).toEqual([gitDir, commonDir]);
        } finally {
            removeDirSyncWithRetry(root);
        }
    });

    it('ignores transient git lock and watchman cookie files', () => {
        expect(isGitMetadataChangePath('/repo/.git/index')).toBe(true);
        expect(isGitMetadataChangePath('/repo/.git/FETCH_HEAD')).toBe(true);
        expect(isGitMetadataChangePath('/repo/.git/index.lock')).toBe(false);
        expect(isGitMetadataChangePath('/repo/.git/.watchman-cookie-123')).toBe(false);
    });
});

function relativeWatcher(rootPath: string, pattern: string) {
    return workspace.fileSystemWatchers.find((candidate) =>
        candidate.pattern instanceof RelativePattern
        && candidate.pattern.baseUri.fsPath === rootPath
        && candidate.pattern.pattern === pattern);
}
