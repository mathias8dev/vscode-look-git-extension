import type { Pagination } from '../shared/base';

export interface GraphFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;   // ISO 8601 date string
    readonly dateTo?: string;
    readonly path?: string;
    readonly branches?: readonly string[];
}

export type GraphPage = Pagination;

export interface GraphCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;   // ISO 8601
    readonly parentHashes: readonly string[];
    readonly refs: readonly string[];
    readonly matchesFilter?: boolean;
}

export interface BranchInfo {
    readonly name: string;
    readonly isRemote: boolean;
    readonly isCurrent: boolean;
    readonly hash: string;
    readonly upstream?: string;
    readonly ahead?: number;
    readonly behind?: number;
}

export interface TagInfo {
    readonly name: string;
    readonly hash: string;
}

export interface WorktreeInfo {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly isMain: boolean;
    readonly isDetached: boolean;
}

export interface GraphData {
    readonly branches: readonly BranchInfo[];
    readonly tags: readonly TagInfo[];
    readonly commits: readonly GraphCommit[];
    readonly currentBranch: string;
    readonly currentUser: string;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly totalCount: number;
    readonly hasRemotes: boolean;
    readonly repositoryWebUrl?: string;
    readonly worktrees: readonly WorktreeInfo[];
    readonly currentBranchCommitHashes?: readonly string[];
}

export interface CommitFileChange {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
}
