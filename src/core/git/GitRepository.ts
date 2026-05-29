import type { GitCommit, GitGraphCommit, GitFileChange } from './domain/GitCommit';
import type { GitStatus, GitStash, GitBranch, GitTag } from './domain/GitStatus';
import type { GitWorktree, GitSubmodule } from './domain/GitWorktree';

export type GitExec = (args: readonly string[], signal?: AbortSignal) => Promise<string>;

export interface GraphLogFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
}

export interface GitRepository {
    readonly cwd: string;

    exec(args: readonly string[], signal?: AbortSignal): Promise<string>;
    execRaw(args: readonly string[], signal?: AbortSignal): Promise<string>;
    getGitDir(): Promise<string>;

    // Status
    getStatus(signal?: AbortSignal): Promise<GitStatus>;
    getSubmodulePaths(signal?: AbortSignal): Promise<ReadonlySet<string>>;
    stashList(signal?: AbortSignal): Promise<readonly GitStash[]>;
    getStashFiles(index: number, signal?: AbortSignal): Promise<readonly GitFileChange[]>;

    // Commits
    getLog(limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getGraphLog(maxCount: number, branches?: readonly string[], pathFilter?: string, filters?: GraphLogFilters, signal?: AbortSignal): Promise<readonly GitGraphCommit[]>;
    getCommitFiles(commitHash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    getCommitMessage(commitHash: string, signal?: AbortSignal): Promise<string>;

    // Branches & tags
    getAllBranches(signal?: AbortSignal): Promise<readonly GitBranch[]>;
    getAllTags(signal?: AbortSignal): Promise<readonly GitTag[]>;
    getCurrentBranch(signal?: AbortSignal): Promise<string>;
    getUserName(signal?: AbortSignal): Promise<string>;
    getRemotes(signal?: AbortSignal): Promise<readonly string[]>;

    // Worktrees
    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]>;
    addWorktree(worktreePath: string, branch: string, createNew?: boolean, signal?: AbortSignal): Promise<void>;
    removeWorktree(worktreePath: string, force?: boolean, signal?: AbortSignal): Promise<void>;

    // Submodules
    getSubmoduleStatus(signal?: AbortSignal): Promise<readonly GitSubmodule[]>;
    updateSubmodule(submodulePath: string, signal?: AbortSignal): Promise<void>;
    updateAllSubmodules(signal?: AbortSignal): Promise<void>;

    // Mutations — no AbortSignal (write ops should complete once started)
    stageFile(filePath: string): Promise<void>;
    unstageFile(filePath: string): Promise<void>;
    stageAll(): Promise<void>;
    unstageAll(): Promise<void>;
    discardFile(filePath: string): Promise<void>;
    commit(message: string): Promise<void>;
    commitAmend(message: string): Promise<void>;
    push(): Promise<void>;
    pullAndPush(): Promise<void>;
    acceptOurs(filePath: string): Promise<void>;
    acceptTheirs(filePath: string): Promise<void>;
    mergeContinue(): Promise<void>;
    mergeAbort(): Promise<void>;
    rebaseContinue(): Promise<void>;
    rebaseAbort(): Promise<void>;
    stash(message?: string): Promise<void>;
    stashStaged(message?: string): Promise<void>;
    stashPop(index: number): Promise<void>;
    stashApply(index: number): Promise<void>;
    stashDrop(index: number): Promise<void>;
    checkout(ref: string): Promise<void>;
    checkoutNewBranch(branchName: string, startPoint?: string): Promise<void>;
    deleteBranch(branchName: string): Promise<void>;
    deleteRemoteBranch(remote: string, branchName: string): Promise<void>;
    renameBranch(oldName: string, newName: string): Promise<void>;
    rebase(targetBranch: string): Promise<void>;
    merge(branch: string): Promise<void>;
    pushBranch(remote: string, branch: string): Promise<void>;
    fetchBranch(remote: string, branch: string): Promise<void>;
    fetchAll(): Promise<void>;
    pull(): Promise<void>;
}

// Re-export domain types so consumers have one import path
export type { GitCommit, GitGraphCommit, GitFileChange, GitStatus, GitStash, GitBranch, GitTag, GitWorktree, GitSubmodule };
