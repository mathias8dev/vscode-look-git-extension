import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import { isRebaseInProgress } from './git-operation-state';
import { createReadonlyDocumentUri } from './readonly-diff-documents';

const OpenMergeEditorCommand = '_open.mergeEditor';
const OpenAllConflictsAction = 'Open All in Merge Editor';

enum ConflictStage {
    Base = 1,
    Ours = 2,
    Theirs = 3,
}

interface MergeEditorInputData {
    readonly uri: vscode.Uri;
    readonly title: string;
}

export async function openThreeWayMergeEditor(repo: GitRepository, filePath: string): Promise<void> {
    const [stages, isRebase] = await Promise.all([
        readConflictStages(repo, filePath),
        isRebaseInProgress(repo),
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
    const output = vscode.Uri.file(path.join(repo.cwd, filePath));

    await vscode.commands.executeCommand(OpenMergeEditorCommand, {
        base,
        input1: isRebase ? current : incoming,
        input2: isRebase ? incoming : current,
        output,
    });
}

export async function openAllThreeWayMergeEditors(repo: GitRepository, filePaths: readonly string[]): Promise<void> {
    if (filePaths.length === 0) {
        await vscode.window.showInformationMessage('No conflicts to open.');
        return;
    }
    for (const filePath of filePaths) {
        await openThreeWayMergeEditor(repo, filePath);
    }
}

export async function notifyConflictsDetected(
    repo: GitRepository,
    message: string,
    filePaths: readonly string[],
    mergeEditorFilePaths: readonly string[] = filePaths,
): Promise<void> {
    if (filePaths.length === 0) { return; }
    const actions = mergeEditorFilePaths.length > 0 ? [OpenAllConflictsAction] : [];
    const choice = await vscode.window.showWarningMessage(
        `${message} ${conflictCountText(filePaths.length)}.`,
        { modal: false },
        ...actions,
    );
    if (choice === OpenAllConflictsAction) {
        await openAllThreeWayMergeEditors(repo, mergeEditorFilePaths);
    }
}

async function readConflictStages(repo: GitRepository, filePath: string): Promise<{
    readonly base: string;
    readonly ours: string;
    readonly theirs: string;
}> {
    const hashes = await readConflictStageHashes(repo, filePath);
    const [base, ours, theirs] = await Promise.all([
        readObject(repo, hashes.get(ConflictStage.Base)),
        readObject(repo, hashes.get(ConflictStage.Ours)),
        readObject(repo, hashes.get(ConflictStage.Theirs)),
    ]);
    return { base, ours, theirs };
}

async function readConflictStageHashes(repo: GitRepository, filePath: string): Promise<ReadonlyMap<ConflictStage, string>> {
    const raw = await repo.execRaw(['ls-files', '-u', '-z', '--', filePath]);
    const hashes = new Map<ConflictStage, string>();
    for (const entry of raw.split('\0')) {
        if (!entry) { continue; }
        const match = entry.match(/^\d+\s+([0-9a-fA-F]+)\s+([123])\t/);
        if (!match?.[1] || !match[2]) { continue; }
        hashes.set(Number(match[2]) as ConflictStage, match[1]);
    }
    return hashes;
}

async function readObject(repo: GitRepository, hash: string | undefined): Promise<string> {
    if (!hash) { return ''; }
    return repo.execRaw(['cat-file', '-p', hash]);
}

function fileExtension(filePath: string): string {
    const extension = path.extname(filePath).replace(/^\./, '');
    return extension || 'txt';
}

function conflictCountText(count: number): string {
    return count === 1 ? '1 unresolved conflict' : `${count} unresolved conflicts`;
}
