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

export interface StashEntry {
    readonly index: number;
    readonly message: string;
}

export interface BranchInfo {
    readonly name: string;
    readonly isRemote: boolean;
    readonly isCurrent: boolean;
    readonly hash: string;
    readonly upstream?: string;
    readonly ahead: number;
    readonly behind: number;
}

export interface TagInfo {
    readonly name: string;
    readonly hash: string;
}
