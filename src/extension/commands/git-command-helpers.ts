import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { GitRepository } from '../../application/ports/git-repository';
import type { GitWorktree } from '../../core/git/domain/GitWorktree';
import type { DiffNameStatusEntry } from '../../core/parsing/parse-diff-name-status';
import { parseDiffNameStatus } from '../../core/parsing/parse-diff-name-status';
import { openReadonlyDiffDocument } from '../utils/readonly-diff-documents';

type ChangesResource = readonly [vscode.Uri, vscode.Uri, vscode.Uri];

export async function assertNoUnmergedFiles(repo: GitRepository, operation: string): Promise<void> {
    const unmerged = await repo.execRaw(['diff', '--name-only', '--diff-filter=U']);
    if (unmerged.trim()) {
        throw new Error(`Resolve existing merge/rebase conflicts before ${operation}.`);
    }
}

export async function promptNewWorktreePath(repo: GitRepository, prompt: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ prompt, placeHolder: '/absolute/path/to/worktree' });
    if (!input?.trim()) { return undefined; }
    const worktreePath = input.trim();
    if (!path.isAbsolute(worktreePath)) { throw new Error('Worktree path must be absolute.'); }
    if (path.resolve(worktreePath) === path.resolve(repo.cwd)) { throw new Error('Worktree path already exists.'); }
    if (await pathExists(worktreePath)) { throw new Error('Worktree path already exists.'); }
    return worktreePath;
}

export async function compareRefWithPickedWorktree(repo: GitRepository, ref: string, titlePrefix: string): Promise<boolean> {
    const worktree = await pickWorktree(repo, 'Select worktree to compare');
    if (!worktree) { return false; }
    await openChangesWithWorkingTree(repo, worktree.path, ref, `${titlePrefix} with ${path.basename(worktree.path)}`);
    return true;
}

export async function openChangesBetweenMergeBaseAndRef(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const mergeBase = await repo.exec(['merge-base', leftRef, rightRef]);
    await openChangesBetweenRefs(repo, mergeBase, rightRef, title);
}

export async function openChangesWithWorkingTree(repo: GitRepository, worktreePath: string, baseRef: string, title: string): Promise<void> {
    const resources = await workingTreeChangeResources(repo, worktreePath, baseRef);
    await openChangesEditor(title, resources);
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return false; }
        throw error;
    }
}

async function pickWorktree(repo: GitRepository, placeHolder: string): Promise<GitWorktree | undefined> {
    const worktrees = await repo.listWorktrees();
    const paths = worktrees.map((worktree) => worktree.path);
    const selectedPath = await vscode.window.showQuickPick(paths, { placeHolder });
    return selectedPath ? worktrees.find((worktree) => worktree.path === selectedPath) : undefined;
}

async function openChangesBetweenRefs(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const output = await repo.execRaw(['diff', '--name-status', '-z', leftRef, rightRef, '--']);
    const resources = await Promise.all(parseDiffNameStatus(output).map((entry) => refChangeResource(repo, leftRef, rightRef, entry)));
    await openChangesEditor(title, resources);
}

async function openChangesEditor(title: string, resources: readonly ChangesResource[]): Promise<void> {
    if (resources.length === 0) {
        await openDiffDocument(title, 'No changes.\n');
        return;
    }
    await vscode.commands.executeCommand('vscode.changes', title, resources);
}

async function workingTreeChangeResources(repo: GitRepository, worktreePath: string, baseRef: string): Promise<readonly ChangesResource[]> {
    const tracked = parseDiffNameStatus(await repo.execRaw(['-C', worktreePath, 'diff', '--name-status', '-z', baseRef, '--']));
    const untracked = (await repo.execRaw(['-C', worktreePath, 'ls-files', '--others', '--exclude-standard', '-z']))
        .split('\0')
        .filter(Boolean)
        .map((filePath): DiffNameStatusEntry => ({ status: '?', filePath }));
    return Promise.all([...tracked, ...untracked].map((entry) => workingTreeChangeResource(repo, worktreePath, baseRef, entry)));
}

async function refChangeResource(repo: GitRepository, leftRef: string, rightRef: string, entry: DiffNameStatusEntry): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(repo.cwd, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A') {
        return [fileUri, await emptyDiffUri(rightRef, entry.filePath, 'original'), await refBlobUri(repo, repo.cwd, rightRef, entry.filePath, 'modified')];
    }
    if (entry.status === 'D') {
        return [fileUri, await refBlobUri(repo, repo.cwd, leftRef, origPath, 'original'), await emptyDiffUri(leftRef, entry.filePath, 'modified')];
    }
    return [
        fileUri,
        await refBlobUri(repo, repo.cwd, leftRef, origPath, 'original'),
        await refBlobUri(repo, repo.cwd, rightRef, entry.filePath, 'modified'),
    ];
}

async function workingTreeChangeResource(repo: GitRepository, worktreePath: string, baseRef: string, entry: DiffNameStatusEntry): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(worktreePath, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A' || entry.status === '?') {
        return [fileUri, await emptyDiffUri('working-tree', entry.filePath, 'original'), fileUri];
    }
    if (entry.status === 'D') {
        return [fileUri, await refBlobUri(repo, worktreePath, baseRef, origPath, 'original'), await emptyDiffUri(baseRef, entry.filePath, 'modified')];
    }
    return [fileUri, await refBlobUri(repo, worktreePath, baseRef, origPath, 'original'), fileUri];
}

async function refBlobUri(repo: GitRepository, cwd: string, ref: string, filePath: string, side: string): Promise<vscode.Uri> {
    const content = await repo.execRaw(['-C', cwd, 'show', `${ref}:${filePath}`]);
    return tempDiffUri(ref, filePath, side, content);
}

async function openDiffDocument(title: string, content: string): Promise<void> {
    await openReadonlyDiffDocument(title, content);
}

async function emptyDiffUri(commitHash: string, filePath: string, side: string): Promise<vscode.Uri> {
    return tempDiffUri(commitHash, filePath, side, '');
}

async function tempDiffUri(namespace: string, filePath: string, side: string, content: string): Promise<vscode.Uri> {
    const dir = path.join(os.tmpdir(), 'look-git-empty-diffs');
    const safeNamespace = Buffer.from(namespace).toString('base64url').substring(0, 16);
    const fileName = `${safeNamespace}-${side}-${Buffer.from(filePath).toString('base64url')}`;
    const emptyPath = path.join(dir, fileName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(emptyPath, content);
    return vscode.Uri.file(emptyPath);
}
