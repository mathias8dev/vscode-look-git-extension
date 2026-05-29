export type RepoKind = 'main' | 'worktree' | 'submodule';
export type SubmoduleStatus = 'clean' | 'dirty' | 'out-of-sync' | 'not-initialized';

export interface SerializedRepoContext {
    readonly id: string;
    readonly cwd: string;
    readonly kind: RepoKind;
    readonly parentId?: string;
    readonly label: string;
}
