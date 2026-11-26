import * as path from 'path';
import * as vscode from 'vscode';
import type { Worktree } from '@application/ports/git-topology';
import { gitBlobUri } from '@extension/utils/git-blob-file-system';

const OpenMergeEditorCommand = '_open.mergeEditor';

interface MergeEditorInputData {
    readonly uri: vscode.Uri;
    readonly title: string;
}

export async function openRuntimeThreeWayMergeEditor(worktree: Worktree, filePath: string): Promise<void> {
    const [stages, status] = await Promise.all([
        worktree.getConflictStages(filePath),
        worktree.getStatus(),
    ]);
    const originalPath = path.join(worktree.path, filePath);
    const base = gitBlobUri('merge', originalPath, 'base', stages.base);
    const current = {
        uri: gitBlobUri('merge', originalPath, 'current', stages.ours),
        title: 'Current',
    } satisfies MergeEditorInputData;
    const incoming = {
        uri: gitBlobUri('merge', originalPath, 'incoming', stages.theirs),
        title: 'Incoming',
    } satisfies MergeEditorInputData;
    const output = vscode.Uri.file(path.join(worktree.path, filePath));
    const isRebase = status.conflictState === 'rebase';

    await vscode.commands.executeCommand(OpenMergeEditorCommand, {
        base,
        input1: isRebase ? current : incoming,
        input2: isRebase ? incoming : current,
        output,
    });
}

export async function openAllRuntimeThreeWayMergeEditors(worktree: Worktree, filePaths: readonly string[]): Promise<void> {
    if (filePaths.length === 0) {
        await vscode.window.showInformationMessage('No conflicts to open.');
        return;
    }
    for (const filePath of filePaths) {
        await openRuntimeThreeWayMergeEditor(worktree, filePath);
    }
}

export async function notifyRuntimeConflictsDetected(
    worktree: Worktree,
    message: string,
    filePaths: readonly string[],
    mergeEditorFilePaths: readonly string[] = filePaths,
): Promise<void> {
    if (filePaths.length === 0) { return; }
    const choice = await vscode.window.showWarningMessage(
        `${message} ${conflictCountText(filePaths.length)}.`,
        { modal: false },
        ...(mergeEditorFilePaths.length > 0 ? ['Open All in Merge Editor'] : []),
    );
    if (choice === 'Open All in Merge Editor') {
        await openAllRuntimeThreeWayMergeEditors(worktree, mergeEditorFilePaths);
    }
}

function conflictCountText(count: number): string {
    return count === 1 ? '1 unresolved conflict' : `${count} unresolved conflicts`;
}
