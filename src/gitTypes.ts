export interface GitCommitInfo {
    hash: string;
    shortHash: string;
    message: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    parentHashes: string[];
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface GitFileChange {
    status: GitFileStatus;
    filePath: string;
    origPath?: string;
    parentHash?: string;
}

export interface GitStatusEntry {
    indexStatus: string;
    workTreeStatus: string;
    filePath: string;
    origPath?: string;
}

export interface StashEntry {
    index: number;
    message: string;
}

export interface BranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
    hash: string;
    upstream?: string;
    ahead: number;
    behind: number;
}

export interface TagInfo {
    name: string;
    hash: string;
}

export interface GraphCommitInfo extends GitCommitInfo {
    refs: string[];
    matchesFilter?: boolean;
}

export interface GraphLogFilters {
    search?: string;
    authors?: string[];
    dateFrom?: string;
    dateTo?: string;
}

export interface GitStatus {
    staged: GitStatusEntry[];
    unstaged: GitStatusEntry[];
    conflicts: GitStatusEntry[];
    conflictState: 'none' | 'merge' | 'rebase';
}
