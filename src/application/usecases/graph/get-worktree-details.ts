import type { Worktree } from '../../ports/git-topology';
import type { GitStatus, GitStatusEntry } from '../../../core/git/domain/GitStatus';

export interface WorktreeDetailsFile {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly isSubmodule?: boolean;
}

export interface WorktreeDetailsResult {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly files: readonly WorktreeDetailsFile[];
}

export class GetWorktreeDetailsUseCase {
    async execute(worktree: Worktree, signal?: AbortSignal): Promise<WorktreeDetailsResult> {
        return {
            path: worktree.path,
            head: worktree.head,
            branch: worktree.branch,
            files: statusFiles(await worktree.getStatus(signal)),
        };
    }
}

function statusFiles(status: GitStatus): readonly WorktreeDetailsFile[] {
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
        ...(entry.isSubmodule ? { isSubmodule: entry.isSubmodule } : {}),
    };
}

function statusFileKey(entry: GitStatusEntry): string {
    return `${entry.filePath}\0${entry.origPath ?? ''}`;
}

function statusCode(status: string): string {
    return status === ' ' ? 'M' : status;
}
