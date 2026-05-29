export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

/** Raw commit from git log parsing. */
export interface GitCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;   // ISO 8601
    readonly parentHashes: readonly string[];
}

/** Raw graph commit — includes refs and server-side filter result. */
export interface GitGraphCommit extends GitCommit {
    readonly refs: readonly string[];
    readonly matchesFilter?: boolean;
}

/** Raw file change from git diff/show output. */
export interface GitFileChange {
    readonly status: GitFileStatus;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}
