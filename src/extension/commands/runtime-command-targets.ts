import type { GitRepository, Worktree } from '@application/ports/git-topology';

export interface RuntimeCommandTargets {
    readonly repository?: GitRepository;
    readonly worktree?: Worktree;
    readonly worktrees?: readonly Worktree[];
}

export function requireRuntimeRepository(targets: RuntimeCommandTargets): GitRepository {
    if (!targets.repository) {
        throw new Error('Runtime GitRepository is required for this git operation.');
    }
    return targets.repository;
}

export function requireRuntimeWorktree(targets: RuntimeCommandTargets): Worktree {
    if (!targets.worktree) {
        throw new Error('Runtime Worktree is required for this git operation.');
    }
    return targets.worktree;
}

export function requireRuntimeTargets(targets: RuntimeCommandTargets): { readonly repository: GitRepository; readonly worktree: Worktree } {
    return {
        repository: requireRuntimeRepository(targets),
        worktree: requireRuntimeWorktree(targets),
    };
}

export function requireRuntimeWorktrees(targets: RuntimeCommandTargets): readonly Worktree[] {
    if (!targets.worktrees) {
        throw new Error('Runtime worktrees are required for this git operation.');
    }
    return targets.worktrees;
}

export function requireRuntimeWorktreePath(targets: RuntimeCommandTargets, worktreePath: string): Worktree {
    const normalized = normalizePath(worktreePath);
    const worktree = targets.worktrees?.find((candidate) => normalizePath(candidate.path) === normalized);
    if (!worktree) {
        throw new Error(`Runtime Worktree is required for "${worktreePath}".`);
    }
    return worktree;
}

function normalizePath(value: string): string {
    return value.replace(/[\\/]+/g, '/');
}
