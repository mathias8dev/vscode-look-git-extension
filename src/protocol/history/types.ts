import type { Pagination } from '@protocol/shared/base';

export interface HistoryCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorDate: string;
    readonly parentHashes: readonly string[];
    readonly refs: readonly HistoryCommitRef[];
    readonly canCherryPick?: boolean;
}

export type HistoryCommitRefKind = 'local' | 'remote' | 'tag';

export interface HistoryCommitRef {
    readonly name: string;
    readonly kind: HistoryCommitRefKind;
    readonly isCurrent?: boolean;
}

export interface HistoryData {
    readonly commits: readonly HistoryCommit[];
    readonly page: Pagination;
    readonly hasMore: boolean;
}

export type HistoryFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface HistoryCommitFile {
    readonly status: HistoryFileStatus;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}

export interface HistoryCommitDetails {
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: readonly HistoryCommitFile[];
}

export interface HistoryCommitContextTarget {
    readonly kind: 'commit';
    readonly hash: string;
    readonly hashes: readonly string[];
    readonly childHash?: string;
    readonly parentHash?: string;
    readonly canUndoCommit: boolean;
    readonly canCherryPick?: boolean;
}

export interface HistoryFileContextTarget {
    readonly kind: 'file';
    readonly commitHash: string;
    readonly file: HistoryCommitFile;
}

export type HistoryContextTarget =
    | HistoryCommitContextTarget
    | HistoryFileContextTarget;
