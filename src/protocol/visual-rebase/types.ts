export type VisualRebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop' | 'break' | 'merge';

export interface VisualRebaseCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorDate: string;
    readonly action: VisualRebaseAction;
    readonly isMerge: boolean;
}

export interface VisualRebasePlanEntry {
    readonly hash: string;
    readonly action: VisualRebaseAction;
    readonly message: string;
}

export interface VisualRebaseSafety {
    readonly workingTreeClean: boolean;
    readonly hasUpstream: boolean;
    readonly pushedCommits: number;
    readonly backupRef: string;
}

export type VisualRebaseRefKind = 'localBranch' | 'remoteBranch' | 'tag';

export interface VisualRebaseRef {
    readonly name: string;
    readonly kind: VisualRebaseRefKind;
    readonly hash: string;
    readonly isCurrent?: boolean;
    readonly upstream?: string;
}

export type VisualRebaseConflictFileState = 'unmerged' | 'merged';

export interface VisualRebaseConflictFile {
    readonly filePath: string;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
    readonly state: VisualRebaseConflictFileState;
    readonly origPath?: string;
}
