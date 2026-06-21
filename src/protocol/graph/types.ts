import type { Pagination } from '@protocol/shared/base';
import type { RepositoryLocator, SubmoduleStatus, WorktreeLocator } from '@protocol/shared/repo';

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
    readonly canCherryPick?: boolean;
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
    readonly locator?: WorktreeLocator;
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly isMain: boolean;
    readonly isDetached: boolean;
    readonly isLocked: boolean;
    readonly lockReason?: string;
}

export interface WorktreeWip {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly staged: number;
    readonly unstaged: number;
    readonly untracked: number;
    readonly conflicts: number;
}

export interface GraphSubmoduleInfo {
    readonly repository?: RepositoryLocator;
    readonly path: string;
    readonly name: string;
    readonly status: SubmoduleStatus;
    readonly branches: readonly BranchInfo[];
    readonly worktrees: readonly WorktreeInfo[];
}

export interface GraphData {
    readonly repository?: RepositoryLocator;
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
    readonly worktreeWips: readonly WorktreeWip[];
    readonly submodules: readonly GraphSubmoduleInfo[];
}

export interface CommitFileChange {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}

export interface GraphCommitContextTarget {
    readonly kind: 'commit';
    readonly hash: string;
    readonly hashes: readonly string[];
    readonly repository?: RepositoryLocator;
    readonly childHash?: string;
    readonly parentHash?: string;
    readonly canUndoCommit: boolean;
    readonly canCherryPick?: boolean;
    readonly canSquash?: boolean;
}

export interface GraphBranchContextTarget {
    readonly kind: 'branch';
    readonly branch: string;
    readonly isRemote: boolean;
    readonly isCurrent?: boolean;
    readonly hasUpstream?: boolean;
    readonly canPush?: boolean;
    readonly canPublish?: boolean;
    readonly canDelete?: boolean;
    readonly repository?: RepositoryLocator;
}

export interface GraphWorktreeContextTarget {
    readonly kind: 'worktree';
    readonly path: string;
    readonly repository?: RepositoryLocator;
    readonly worktree?: WorktreeLocator;
}

export type GraphContextTarget =
    | GraphCommitContextTarget
    | GraphBranchContextTarget
    | GraphWorktreeContextTarget;
