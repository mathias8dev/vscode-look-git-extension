import type { GitRepository, Worktree } from '../../application/ports/git-topology';

export interface RuntimeCommandTargets {
    readonly repository?: GitRepository;
    readonly worktree?: Worktree;
}
