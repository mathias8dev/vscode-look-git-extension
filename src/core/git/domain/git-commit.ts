export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface GitCommitInput {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;
    readonly parentHashes: readonly string[];
    readonly refs?: readonly string[];
}

export class GitCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;
    readonly parentHashes: readonly string[];
    readonly refs?: readonly string[];

    constructor(input: GitCommitInput) {
        this.hash = input.hash;
        this.shortHash = input.shortHash;
        this.message = input.message;
        this.authorName = input.authorName;
        this.authorEmail = input.authorEmail;
        this.authorDate = input.authorDate;
        this.parentHashes = input.parentHashes;
        this.refs = input.refs ?? [];
    }
}

export type GitGraphCommit = GitCommit & {
    readonly refs: readonly string[];
    readonly matchesFilter?: boolean;
};

export interface GitFileChange {
    readonly status: GitFileStatus;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}
