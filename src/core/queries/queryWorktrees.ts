import type { GitExec } from '../git/git-exec';
import type { GitWorktree } from '../git/domain/GitWorktree';
import { parseWorktreeList } from '../parsing/parseWorktreeList';

export async function queryWorktrees(execRawReadonly: GitExec, signal?: AbortSignal): Promise<GitWorktree[]> {
    const output = await execRawReadonly(['worktree', 'list', '--porcelain'], signal);
    return parseWorktreeList(output);
}

export async function addWorktree(
    exec: GitExec,
    worktreePath: string,
    branch: string,
    createNew = false,
    startPoint?: string,
    signal?: AbortSignal,
): Promise<void> {
    const args = createNew
        ? ['worktree', 'add', '-b', branch, worktreePath, ...(startPoint ? [startPoint] : [])]
        : ['worktree', 'add', worktreePath, branch];
    await exec(args, signal);
}

export async function removeWorktree(
    exec: GitExec,
    worktreePath: string,
    force = false,
    signal?: AbortSignal,
): Promise<void> {
    const args: string[] = ['worktree', 'remove', worktreePath];
    if (force) { args.push('--force'); }
    await exec(args, signal);
}
