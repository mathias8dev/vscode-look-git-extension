import type { SubmoduleStatus } from '../shared/repo';

export interface SubmoduleEntry {
    readonly path: string;
    readonly name: string;
    readonly status: SubmoduleStatus;
}

export interface SubmoduleStatusData {
    readonly currentBranch?: string;
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

export interface ChangesCommitComposerContextTarget {
    readonly kind: 'commitComposer';
    readonly message: string;
    readonly submodulePath?: string;
}

export interface ChangesSelectionContextTarget {
    readonly kind: 'selection';
    readonly filePaths: readonly string[];
    readonly stageFilePaths: readonly string[];
    readonly unstageFilePaths: readonly string[];
    readonly discardFilePaths: readonly string[];
    readonly stashFilePaths: readonly string[];
    readonly stashIncludeUntracked: boolean;
}

export type ChangesContextTarget =
    | ChangesSubmoduleToolbarContextTarget
    | ChangesCommitComposerContextTarget
    | ChangesSelectionContextTarget;

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
    readonly currentBranch?: string;
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
