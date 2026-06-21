import * as vscode from 'vscode';
import type { GitRepository } from '@application/ports/git-topology';
import { gitBlobUri } from '@extension/utils/git-blob-documents';

type CommitDiffFile = {
    readonly commitHash: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly status: string;
};

type DiffUris = {
    readonly left: vscode.Uri;
    readonly right: vscode.Uri;
};

export type BlobContentReader = (ref: string, filePath: string) => Promise<string>;

export async function commitFileTempDiffUris(repo: GitRepository, cwd: string, file: CommitDiffFile): Promise<DiffUris> {
    const parentRef = file.parentHash ?? `${file.commitHash}~1`;
    const status = file.status.charAt(0);
    const origPath = file.origPath ?? file.filePath;

    if (status === 'A') {
        return {
            left: emptyDiffUri(file.commitHash, file.filePath, 'parent'),
            right: await refBlobUri(repo, cwd, file.commitHash, file.filePath, 'commit'),
        };
    }

    if (status === 'D') {
        return {
            left: await refBlobUri(repo, cwd, parentRef, origPath, 'parent'),
            right: emptyDiffUri(file.commitHash, file.filePath, 'commit'),
        };
    }

    return {
        left: await refBlobUri(repo, cwd, parentRef, origPath, 'parent'),
        right: await refBlobUri(repo, cwd, file.commitHash, file.filePath, 'commit'),
    };
}

export function emptyDiffUri(namespace: string, filePath: string, side: string): vscode.Uri {
    return gitBlobUri(namespace, filePath, side, '');
}

export async function refBlobUri(
    repo: GitRepository,
    _cwd: string,
    ref: string,
    filePath: string,
    side: string,
): Promise<vscode.Uri> {
    const content = await repo.getFileAtRevision(filePath, ref);
    return gitBlobUri(ref, filePath, side, content);
}

export async function refBlobUriFrom(
    readBlob: BlobContentReader,
    ref: string,
    filePath: string,
    side: string,
): Promise<vscode.Uri> {
    const content = await readBlob(ref, filePath);
    return gitBlobUri(ref, filePath, side, content);
}
