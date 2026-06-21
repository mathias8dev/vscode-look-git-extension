import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { GitFileChange } from '@core/git/domain/git-commit';
import { openReadonlyDiffDocument } from '@extension/utils/readonly-diff-documents';
import { emptyDiffUri, refBlobUriFrom } from '@extension/utils/diff-uris';

type ChangesResource = readonly [vscode.Uri, vscode.Uri, vscode.Uri];

export async function assertNoUnmergedFiles(worktree: Worktree, operation: string): Promise<void> {
    const status = await worktree.getStatus();
    if (status.conflicts.length > 0) {
        throw new Error(`Resolve existing merge/rebase conflicts before ${operation}.`);
    }
}

export async function promptNewWorktreePath(repoCwd: string, prompt: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ prompt, placeHolder: '/absolute/path/to/worktree' });
    if (!input?.trim()) { return undefined; }
    const worktreePath = input.trim();
    if (!path.isAbsolute(worktreePath)) { throw new Error('Worktree path must be absolute.'); }
    if (path.resolve(worktreePath) === path.resolve(repoCwd)) { throw new Error('Worktree path already exists.'); }
    if (await pathExists(worktreePath)) { throw new Error('Worktree path already exists.'); }
    return worktreePath;
}

export async function compareRefWithPickedWorktree(repo: GitRepository, worktrees: readonly Worktree[], ref: string, titlePrefix: string): Promise<boolean> {
    const worktree = await pickWorktree(worktrees, 'Select worktree to compare');
    if (!worktree) { return false; }
    await openChangesWithWorkingTree(repo, worktree.path, ref, `${titlePrefix} with ${path.basename(worktree.path)}`);
    return true;
}

export async function openChangesBetweenMergeBaseAndRef(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const mergeBase = await repo.getMergeBase(leftRef, rightRef);
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

async function pickWorktree(worktrees: readonly Worktree[], placeHolder: string): Promise<Worktree | undefined> {
    const paths = worktrees.map((worktree) => worktree.path);
    const selectedPath = await vscode.window.showQuickPick(paths, { placeHolder });
    return selectedPath ? worktrees.find((worktree) => worktree.path === selectedPath) : undefined;
}

async function openChangesBetweenRefs(repo: GitRepository, leftRef: string, rightRef: string, title: string): Promise<void> {
    const resources = await Promise.all((await repo.compareRefs(leftRef, rightRef, { includeRenames: true })).map((entry) => refChangeResource(repo, leftRef, rightRef, entry)));
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
    const changes = await repo.compareWithWorkingTree(baseRef, worktreePath, { includeRenames: true });
    return Promise.all(changes.map((entry) => workingTreeChangeResource(repo, worktreePath, baseRef, entry)));
}

async function refChangeResource(repo: GitRepository, leftRef: string, rightRef: string, entry: GitFileChange): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(repo.cwd, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A') {
        return [fileUri, emptyDiffUri(rightRef, entry.filePath, 'original'), await runtimeRefBlobUri(repo, rightRef, entry.filePath, 'modified')];
    }
    if (entry.status === 'D') {
        return [fileUri, await runtimeRefBlobUri(repo, leftRef, origPath, 'original'), emptyDiffUri(leftRef, entry.filePath, 'modified')];
    }
    return [
        fileUri,
        await runtimeRefBlobUri(repo, leftRef, origPath, 'original'),
        await runtimeRefBlobUri(repo, rightRef, entry.filePath, 'modified'),
    ];
}

async function workingTreeChangeResource(repo: GitRepository, worktreePath: string, baseRef: string, entry: GitFileChange): Promise<ChangesResource> {
    const fileUri = vscode.Uri.file(path.join(worktreePath, entry.filePath));
    const origPath = entry.origPath ?? entry.filePath;

    if (entry.status === 'A') {
        return [fileUri, emptyDiffUri('working-tree', entry.filePath, 'original'), fileUri];
    }
    if (entry.status === 'D') {
        return [fileUri, await runtimeRefBlobUri(repo, baseRef, origPath, 'original'), emptyDiffUri(baseRef, entry.filePath, 'modified')];
    }
    return [fileUri, await runtimeRefBlobUri(repo, baseRef, origPath, 'original'), fileUri];
}

async function openDiffDocument(title: string, content: string): Promise<void> {
    await openReadonlyDiffDocument(title, content);
}

async function runtimeRefBlobUri(repo: GitRepository, ref: string, filePath: string, side: string): Promise<vscode.Uri> {
    return refBlobUriFrom((revision, pathValue) => repo.getFileAtRevision(pathValue, revision), ref, filePath, side);
}
