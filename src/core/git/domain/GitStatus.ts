/** Raw status entry from git status --porcelain=v1 -z. */
export interface GitStatusEntry {
    readonly indexStatus: string;
    readonly workTreeStatus: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly isSubmodule?: boolean;
}

export type ConflictState = 'none' | 'merge' | 'rebase';

export interface GitStatus {
    readonly staged: readonly GitStatusEntry[];
    readonly unstaged: readonly GitStatusEntry[];
    readonly conflicts: readonly GitStatusEntry[];
    readonly conflictState: ConflictState;
}

export interface GitStash {
    readonly index: number;
    readonly message: string;
}

/** Raw branch from git branch/for-each-ref. */
export interface GitBranch {
    readonly name: string;
    readonly isRemote: boolean;
    readonly isCurrent: boolean;
    readonly hash: string;
    readonly upstream?: string;
    readonly ahead: number;
    readonly behind: number;
}

/** Raw tag from git tag. */
export interface GitTag {
    readonly name: string;
    readonly hash: string;
}
