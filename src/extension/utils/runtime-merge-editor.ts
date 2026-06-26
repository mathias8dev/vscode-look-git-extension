import * as path from 'path';
import * as vscode from 'vscode';
import type { Worktree } from '@application/ports/git-topology';
import { createReadonlyDocumentUri } from '@extension/utils/readonly-diff-documents';

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
    const extension = fileExtension(filePath);
    const base = createReadonlyDocumentUri(`${filePath} base`, stages.base, extension);
    const current = {
        uri: createReadonlyDocumentUri(`${filePath} current`, stages.ours, extension),
        title: 'Current',
    } satisfies MergeEditorInputData;
    const incoming = {
        uri: createReadonlyDocumentUri(`${filePath} incoming`, stages.theirs, extension),
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

function fileExtension(filePath: string): string {
    const extension = path.extname(filePath).replace(/^\./, '');
    return extension || 'txt';
}

function conflictCountText(count: number): string {
    return count === 1 ? '1 unresolved conflict' : `${count} unresolved conflicts`;
}
