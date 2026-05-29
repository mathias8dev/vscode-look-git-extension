export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface GitCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;   // ISO 8601 string
    readonly parentHashes: readonly string[];
}

export interface GraphCommit extends GitCommit {
    readonly refs: readonly string[];
    readonly matchesFilter?: boolean;
}

export interface GitFileChange {
    readonly status: GitFileStatus;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}

export type ResetMode = 'soft' | 'mixed' | 'hard';
