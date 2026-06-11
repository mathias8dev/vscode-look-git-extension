import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';

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
            left: await emptyDiffUri(file.commitHash, file.filePath, 'parent'),
            right: toGitUri(fileUri, file.commitHash),
        };
    }

    if (status === 'D') {
        return {
            left: toGitUri(origUri, parentRef),
            right: await emptyDiffUri(file.commitHash, file.filePath, 'commit'),
        };
    }

    return {
        left: toGitUri(origUri, parentRef),
        right: toGitUri(fileUri, file.commitHash),
    };
}

export async function emptyDiffUri(namespace: string, filePath: string, side: string): Promise<vscode.Uri> {
    return tempDiffUri(namespace, filePath, side, '');
}

export async function refBlobUri(
    repo: GitRepository,
    cwd: string,
    ref: string,
    filePath: string,
    side: string,
): Promise<vscode.Uri> {
    const content = await repo.execRaw(['-C', cwd, 'show', `${ref}:${filePath}`]);
    return tempDiffUri(ref, filePath, side, content);
}

export async function tempDiffUri(
    namespace: string,
    filePath: string,
    side: string,
    content: string,
): Promise<vscode.Uri> {
    const dir = path.join(os.tmpdir(), 'look-git-empty-diffs');
    const safeNamespace = Buffer.from(namespace).toString('base64url').substring(0, 16);
    const fileName = `${safeNamespace}-${side}-${Buffer.from(filePath).toString('base64url')}`;
    const tempPath = path.join(dir, fileName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tempPath, content);
    return vscode.Uri.file(tempPath);
}

export function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref }) });
}
