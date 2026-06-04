import type { SubmoduleStatus } from '../shared/repo';

export interface SubmoduleEntry {
    readonly path: string;
    readonly name: string;
    readonly status: SubmoduleStatus;
}

export interface SubmoduleStatusData {
    readonly staged: readonly StatusEntry[];
    readonly unstaged: readonly StatusEntry[];
    readonly conflicts: readonly StatusEntry[];
    readonly conflictState: ConflictState;
    readonly stashes: readonly StashEntry[];
}

export interface ChangesSubmoduleToolbarContextTarget {
    readonly kind: 'submoduleToolbar';
    readonly submodulePath: string;
}

export type ChangesContextTarget = ChangesSubmoduleToolbarContextTarget;

export interface StatusEntry {
    readonly indexStatus: string;
    readonly workTreeStatus: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly isSubmodule?: boolean;
    readonly submoduleStatus?: SubmoduleStatus;
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

export enum ConflictState {
    None = 'none',
    Merge = 'merge',
    Rebase = 'rebase',
}

export enum RepositoryState {
    Available = 'available',
    Missing = 'missing',
}

export interface StatusData {
    readonly repositoryState?: RepositoryState;
    readonly staged: readonly StatusEntry[];
    readonly unstaged: readonly StatusEntry[];
    readonly conflicts: readonly StatusEntry[];
    readonly conflictState: ConflictState;
    readonly stashes: readonly StashEntry[];
    readonly submodules: readonly SubmoduleEntry[];
}

export enum CommitMode {
    Commit = 'commit',
    Amend = 'amend',
    CommitPush = 'commitPush',
    CommitSync = 'commitSync',
}
