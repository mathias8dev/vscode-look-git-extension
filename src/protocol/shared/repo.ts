export type RepoKind = 'main' | 'worktree' | 'submodule';
export type RepositoryKind = 'main' | 'submodule';

export interface RepositoryLocator {
    readonly repoId: string;
    readonly kind: RepositoryKind;
    readonly path: string;
    readonly parentRepoId?: string;
}

export interface WorktreeLocator {
    readonly repoId: string;
    readonly worktreeId: string;
    readonly path: string;
}

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
