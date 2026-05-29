import type { GitCommit, GitGraphCommit, GitFileChange } from './domain/GitCommit';
import type { GitStatus, GitStash, GitBranch, GitTag } from './domain/GitStatus';
import type { GitWorktree, GitSubmodule } from './domain/GitWorktree';

export type GitExec = (args: readonly string[], signal?: AbortSignal) => Promise<string>;

export interface GraphLogFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
}

/**
 * Minimal interface injected into query functions.
 * AbortSignal lives only in exec() — not threaded through every method.
 * Query functions receive exec() directly; they do not receive the full repository.
 *
 * The concrete implementation is GitProcessRepository (extension layer).
 */
export interface GitRepository {
    readonly cwd: string;

    // Low-level execution — the only place AbortSignal appears
    exec(args: readonly string[], signal?: AbortSignal): Promise<string>;
    execRaw(args: readonly string[], signal?: AbortSignal): Promise<string>;

    // Git dir (needed to detect conflict state from filesystem)
    getGitDir(): Promise<string>;
}

// Re-export domain types so extension and query functions have one import path
export type { GitCommit, GitGraphCommit, GitFileChange, GitStatus, GitStash, GitBranch, GitTag, GitWorktree, GitSubmodule };
