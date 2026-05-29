/** Raw worktree from `git worktree list --porcelain`. */
export interface GitWorktree {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly isMain: boolean;
    readonly isDetached: boolean;
}

/** Raw submodule from `git submodule status`. Status is the raw git prefix character. */
export interface GitSubmodule {
    readonly path: string;
    /** Raw git prefix: ' '=clean, '+'=modified, '-'=uninitialized, 'U'=conflict */
    readonly status: ' ' | '+' | '-' | 'U';
}
