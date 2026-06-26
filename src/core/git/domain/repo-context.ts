export enum RepoKind {
    Main = 'main',
    Worktree = 'worktree',
    Submodule = 'submodule',
}

export interface RepoContext {
    readonly id: string;
    readonly cwd: string;
    readonly kind: RepoKind;
    readonly parentId?: string;
    readonly label: string;
}
