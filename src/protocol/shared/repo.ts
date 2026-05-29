export type RepoKind = 'main' | 'worktree' | 'submodule';

export interface SerializedRepoContext {
    readonly id: string;
    readonly cwd: string;
    readonly kind: RepoKind;
    readonly parentId?: string;
    readonly label: string;
}
