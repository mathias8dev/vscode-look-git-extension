import type { CommitFileChange } from '@protocol/shared/commit';

export enum ComparisonMode {
    SinceDivergence = 'sinceDivergence',
    BranchTips = 'branchTips',
}

export interface ComparisonBranch {
    readonly name: string;
    readonly ref: string;
    readonly isRemote: boolean;
}

export interface ComparisonFile extends CommitFileChange {
    readonly additions: number | null;
    readonly deletions: number | null;
    readonly oldRevision?: string;
    readonly newRevision?: string;
}

export interface ComparisonCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorDate: string;
}

export interface ComparisonPage<T> {
    readonly items: readonly T[];
    readonly hasMore: boolean;
    readonly cursor?: string;
    readonly totalCount: number;
}

export interface ComparisonFiles extends ComparisonPage<ComparisonFile> {
    readonly matchingCount: number;
    readonly additions: number;
    readonly deletions: number;
}

export interface ComparisonSnapshot {
    readonly id: string;
    readonly baseBranch: string;
    readonly headBranch: string;
    readonly mode: ComparisonMode;
    readonly baseHash: string;
    readonly headHash: string;
    readonly leftHash: string;
    readonly files: ComparisonFiles;
    readonly commits: ComparisonPage<ComparisonCommit>;
}

export interface ComparisonCommitDetails {
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: ComparisonPage<CommitFileChange>;
}
