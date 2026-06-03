import type { GitRepository } from '../../ports/git-repository';
import type { GitStatusEntry } from '../../../core/git/domain/GitStatus';
import { parsePorcelainStatus } from '../../../core/parsing/parseStatus';

export interface WorktreeDetailsFile {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
}

export interface WorktreeDetailsResult {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly files: readonly WorktreeDetailsFile[];
}

export class GetWorktreeDetailsUseCase {
    async execute(repo: GitRepository, worktreePath: string, signal?: AbortSignal): Promise<WorktreeDetailsResult> {
        const worktrees = signal ? await repo.listWorktrees(signal) : await repo.listWorktrees();
        const worktree = worktrees.find((candidate) => candidate.path === worktreePath);
        if (!worktree) { throw new Error(`Unknown worktree: ${worktreePath}`); }
        const statusArgs = ['-C', worktree.path, 'status', '--porcelain=v1', '-z', '-u'];
        const raw = signal ? await repo.execRaw(statusArgs, signal) : await repo.execRaw(statusArgs);
        return {
            path: worktree.path,
            head: worktree.head,
            branch: worktree.branch,
            files: porcelainStatusFiles(raw),
        };
    }
}

function porcelainStatusFiles(raw: string): readonly WorktreeDetailsFile[] {
    const status = parsePorcelainStatus(raw);
    const files = new Map<string, WorktreeDetailsFile>();

    for (const entry of status.conflicts) {
        files.set(statusFileKey(entry), statusEntryFile(entry, 'U'));
    }
    for (const entry of status.staged) {
        mergeStatusFile(files, entry, statusCode(entry.indexStatus));
    }
    for (const entry of status.unstaged) {
        mergeStatusFile(files, entry, statusCode(entry.indexStatus === '?' ? '?' : entry.workTreeStatus));
    }

    return [...files.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function mergeStatusFile(files: Map<string, WorktreeDetailsFile>, entry: GitStatusEntry, status: string): void {
    const key = statusFileKey(entry);
    const existing = files.get(key);
    if (!existing) {
        files.set(key, statusEntryFile(entry, status));
        return;
    }
    if (!existing.status.includes(status)) {
        files.set(key, { ...existing, status: `${existing.status}${status}` });
    }
}

function statusEntryFile(entry: GitStatusEntry, status: string): WorktreeDetailsFile {
    return {
        status,
        filePath: entry.filePath,
        origPath: entry.origPath,
    };
}

function statusFileKey(entry: GitStatusEntry): string {
    return `${entry.filePath}\0${entry.origPath ?? ''}`;
}

function statusCode(status: string): string {
    return status === ' ' ? 'M' : status;
}
