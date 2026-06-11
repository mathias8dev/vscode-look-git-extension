import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import { gitBlobUri } from './git-blob-documents';

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

export async function commitFileDiffUris(cwd: string, file: CommitDiffFile): Promise<DiffUris> {
    const fileUri = vscode.Uri.file(path.join(cwd, file.filePath));
    const origUri = file.origPath ? vscode.Uri.file(path.join(cwd, file.origPath)) : fileUri;
    const parentRef = file.parentHash ?? `${file.commitHash}~1`;
    const status = file.status.charAt(0);

    if (status === 'A') {
        return {
            left: emptyDiffUri(file.commitHash, file.filePath, 'parent'),
            right: toGitUri(fileUri, file.commitHash),
        };
    }

    if (status === 'D') {
        return {
            left: toGitUri(origUri, parentRef),
            right: emptyDiffUri(file.commitHash, file.filePath, 'commit'),
        };
    }

    return {
        left: toGitUri(origUri, parentRef),
        right: toGitUri(fileUri, file.commitHash),
    };
}

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
    cwd: string,
    ref: string,
    filePath: string,
    side: string,
): Promise<vscode.Uri> {
    const content = await repo.execRaw(['-C', cwd, 'show', `${ref}:${filePath}`]);
    return gitBlobUri(ref, filePath, side, content);
}

export function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref }) });
}
