import * as path from 'path';
import type { GitRepository } from '../../application/ports/git-repository';
import { openReadonlyDiffDocument } from './readonly-diff-documents';

export interface StatusGitlinkDiffInput {
    readonly filePath: string;
    readonly isStaged: boolean;
}

export interface CommitGitlinkDiffInput {
    readonly filePath: string;
    readonly commitHash: string;
    readonly status: string;
    readonly parentHash?: string;
}

export interface WorktreeGitlinkDiffInput {
    readonly worktreePath: string;
    readonly filePath: string;
}

export async function openStatusGitlinkDiff(repo: GitRepository, input: StatusGitlinkDiffInput): Promise<void> {
    const diff = await repo.execRaw([
        'diff',
        '--submodule=short',
        ...(input.isStaged ? ['--cached'] : []),
        '--',
        input.filePath,
    ]);
    await openGitlinkDiffDocument(input.filePath, diff);
}

export async function openCommitGitlinkDiff(repo: GitRepository, input: CommitGitlinkDiffInput): Promise<void> {
    const diff = await commitGitlinkDiff(repo, input);
    await openGitlinkDiffDocument(input.filePath, diff);
}

export async function openWorktreeGitlinkDiff(repo: GitRepository, input: WorktreeGitlinkDiffInput): Promise<void> {
    const diff = await repo.execRaw(['-C', input.worktreePath, 'diff', '--submodule=short', 'HEAD', '--', input.filePath]);
    await openGitlinkDiffDocument(input.filePath, diff);
}

async function commitGitlinkDiff(repo: GitRepository, input: CommitGitlinkDiffInput): Promise<string> {
    if (input.parentHash || input.status.charAt(0) !== 'A') {
        const parentRef = input.parentHash ?? `${input.commitHash}~1`;
        return repo.execRaw(['diff', '--submodule=short', parentRef, input.commitHash, '--', input.filePath]);
    }
    return repo.execRaw(['show', '--format=', '--submodule=short', '--find-renames', input.commitHash, '--', input.filePath]);
}

async function openGitlinkDiffDocument(filePath: string, diff: string): Promise<void> {
    await openReadonlyDiffDocument(
        `${path.basename(filePath)} submodule gitlink`,
        diff.trimEnd() || `No submodule gitlink changes for ${filePath}.\n`,
    );
}
