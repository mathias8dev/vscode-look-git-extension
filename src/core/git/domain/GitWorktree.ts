export interface WorktreeInfo {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly isMain: boolean;
    readonly isDetached: boolean;
}

export interface SubmoduleInfo {
    readonly path: string;
    readonly status: '+' | '-' | 'U' | ' ';  // +modified -uninitialized U conflict ' 'clean
}
