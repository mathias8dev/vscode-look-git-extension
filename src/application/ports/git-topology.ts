import type {
    GitBlameOperations,
    GitBranchOperations,
    GitCheckoutOperations,
    GitCherryPickRevertOperations,
    GitCleanOperations,
    GitCommitOperations,
    GitCompareOperations,
    GitFetchOperations,
    GitFileHistoryOperations,
    GitHistoryOperations,
    GitIndexOperations,
    GitInteractiveRebaseOperations,
    GitMergeOperations,
    GitPatchOperations,
    GitPullPushOperations,
    GitRebaseOperations,
    GitReferenceOperations,
    GitResetUndoOperations,
    GitStashOperations,
    GitStatusOperations,
    GitSubmoduleOperations,
    GitTagOperations,
    GitWorktreeTopologyOperations,
} from '@application/ports/git-capabilities';
import type { GitRuntime, RepositoryKind } from '@application/ports/git-runtime';

export interface GitRepository
    extends GitHistoryOperations,
        GitFileHistoryOperations,
        GitBlameOperations,
        GitCompareOperations,
        GitReferenceOperations,
        GitBranchOperations,
        GitTagOperations,
        GitFetchOperations,
        GitWorktreeTopologyOperations,
        GitSubmoduleOperations {
    readonly repoId: string;
    readonly cwd: string;
    readonly gitDir: string;
    readonly kind: RepositoryKind;
    readonly label: string;
    readonly parentRepositoryId?: string;
    readonly runtime: GitRuntime;
}

export interface Worktree
    extends GitStatusOperations,
        GitIndexOperations,
        GitPatchOperations,
        GitCommitOperations,
        GitStashOperations,
        GitCheckoutOperations,
        GitMergeOperations,
        GitRebaseOperations,
        GitInteractiveRebaseOperations,
        GitCherryPickRevertOperations,
        GitResetUndoOperations,
        GitCleanOperations,
        GitPullPushOperations {
    readonly worktreeId: string;
    readonly repoId: string;
    readonly path: string;
    readonly isMain: boolean;
    readonly head: string;
    readonly branch?: string;
    readonly dirty: boolean;
    readonly runtime: GitRuntime;
}
