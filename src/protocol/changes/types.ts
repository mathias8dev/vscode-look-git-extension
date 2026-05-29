export interface StatusEntry {
    readonly indexStatus: string;
    readonly workTreeStatus: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly isSubmodule?: boolean;
}

export interface StashEntry {
    readonly index: number;
    readonly message: string;
}

export interface StashFileEntry {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
}

export type ConflictState = 'none' | 'merge' | 'rebase';

export interface StatusData {
    readonly staged: readonly StatusEntry[];
    readonly unstaged: readonly StatusEntry[];
    readonly conflicts: readonly StatusEntry[];
    readonly conflictState: ConflictState;
    readonly stashes: readonly StashEntry[];
}

export type CommitMode = 'commit' | 'amend' | 'commitPush' | 'commitSync';
