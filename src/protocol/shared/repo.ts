export type RepoKind = 'main' | 'worktree' | 'submodule';
export enum SubmoduleStatus {
    Clean          = 'clean',
    Dirty          = 'dirty',
    OutOfSync      = 'out-of-sync',
    NotInitialized = 'not-initialized',
}

export interface SerializedRepoContext {
    readonly id: string;
    readonly cwd: string;
    readonly kind: RepoKind;
    readonly parentId?: string;
    readonly label: string;
}
