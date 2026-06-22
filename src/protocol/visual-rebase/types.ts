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
