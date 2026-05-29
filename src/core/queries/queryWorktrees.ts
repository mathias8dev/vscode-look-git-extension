import type { GitExec } from '../git/GitRepository';
import type { GitWorktree } from '../git/domain/GitWorktree';
import { parseWorktreeList } from '../parsing/parseWorktreeList';

export async function queryWorktrees(execRawReadonly: GitExec, signal?: AbortSignal): Promise<GitWorktree[]> {
    try {
        const output = await execRawReadonly(['worktree', 'list', '--porcelain'], signal);
        return parseWorktreeList(output);
    } catch {
        return [];
    }
}

export async function addWorktree(
    exec: GitExec,
    worktreePath: string,
    branch: string,
    createNew = false,
    signal?: AbortSignal,
): Promise<void> {
    const args = createNew
        ? ['worktree', 'add', '-b', branch, worktreePath]
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
