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

export interface GraphRow {
    readonly commit: GraphCommit;
    readonly laneData: LaneData;
}

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

export interface LaneData {
    readonly lane: number;
    readonly color: string;
    readonly lines: readonly LineDef[];
    readonly isPrimary: boolean;
}

export interface LineDef {
    readonly fromLane: number;
    readonly toLane: number;
    readonly color: string;
    readonly type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right';
    readonly targetHash?: string;
    readonly role: 'pass-through' | 'first-parent' | 'merge-parent';
    readonly fromTop?: boolean;
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

export type SubmoduleStatus = 'clean' | 'dirty' | 'out-of-sync' | 'not-initialized';

export interface SubmoduleInfo {
    readonly path: string;
    readonly name: string;
    readonly url: string;
    readonly registeredHash: string;
    readonly headHash?: string;
    readonly status: SubmoduleStatus;
}

export interface GraphData {
    readonly branches: readonly BranchInfo[];
    readonly tags: readonly TagInfo[];
    readonly rows: readonly GraphRow[];
    readonly maxLane: number;
    readonly currentBranch: string;
    readonly currentUser: string;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly totalCount: number;
    readonly hasRemotes: boolean;
    readonly repositoryWebUrl?: string;
    readonly worktrees: readonly WorktreeInfo[];
    readonly submodules: readonly SubmoduleInfo[];
    readonly currentBranchCommitHashes?: readonly string[];
}

export interface CommitFileChange {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}
