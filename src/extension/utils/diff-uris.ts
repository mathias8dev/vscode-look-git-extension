import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '@application/ports/git-topology';
import { gitBlobUri } from '@extension/utils/git-blob-file-system';
import { openCommitGitlinkDiff } from '@extension/utils/gitlink-diff';

export interface CommitDiffFile {
    readonly commitHash: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly status: string;
    readonly isSubmodule?: boolean;
}

type DiffUris = {
    readonly left: vscode.Uri;
    readonly right: vscode.Uri;
};

export async function openCommitFileDiff(repo: GitRepository, file: CommitDiffFile, preview?: boolean, signal?: AbortSignal): Promise<void> {
    if (file.isSubmodule) {
        await openCommitGitlinkDiff(repo, file, signal);
        return;
    }
    const { left, right } = await commitFileDiffUris(repo, file, signal);
    signal?.throwIfAborted();
    const args = [left, right, `${path.basename(file.filePath)} (${file.commitHash.substring(0, 7)})`] as const;
    if (preview === undefined) {
        await vscode.commands.executeCommand('vscode.diff', ...args);
    } else {
        await vscode.commands.executeCommand('vscode.diff', ...args, { preview });
    }
}

export async function commitFileDiffUris(repo: GitRepository, file: CommitDiffFile, signal?: AbortSignal): Promise<DiffUris> {
    const parentRef = file.parentHash ?? `${file.commitHash}~1`;
    const status = file.status.charAt(0);
    const origPath = file.origPath ?? file.filePath;

    if (status === 'A') {
        return {
            left: emptyDiffUri(file.commitHash, file.filePath, 'parent'),
            right: await refBlobUri(repo, file.commitHash, file.filePath, 'commit', signal),
        };
    }

    if (status === 'D') {
        return {
            left: await refBlobUri(repo, parentRef, origPath, 'parent', signal),
            right: emptyDiffUri(file.commitHash, file.filePath, 'commit'),
        };
    }

    return {
        left: await refBlobUri(repo, parentRef, origPath, 'parent', signal),
        right: await refBlobUri(repo, file.commitHash, file.filePath, 'commit', signal),
    };
}

export function emptyDiffUri(namespace: string, filePath: string, side: string): vscode.Uri {
    return gitBlobUri(namespace, filePath, side, new Uint8Array());
}

export async function refBlobUri(
    repo: GitRepository,
    ref: string,
    filePath: string,
    side: string,
    signal?: AbortSignal,
): Promise<vscode.Uri> {
    const content = await repo.getFileAtRevision(filePath, ref, signal);
    return gitBlobUri(ref, path.join(repo.cwd, filePath), side, content);
}
