import type { GitExec } from '../../core/git/git-exec';
import type { GitCommit, GitGraphCommit, GitFileChange } from '../../core/git/domain/GitCommit';
import type { GitStatus, GitStash, GitBranch, GitTag } from '../../core/git/domain/GitStatus';
import type { GitWorktree, GitSubmodule } from '../../core/git/domain/GitWorktree';

export interface GraphLogFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly skip?: number;
}

export interface GitRepository {
    readonly cwd: string;

    exec(args: readonly string[], signal?: AbortSignal): Promise<string>;
    execRaw(args: readonly string[], signal?: AbortSignal): Promise<string>;
    execWithEnv(args: readonly string[], env: Record<string, string>, signal?: AbortSignal): Promise<string>;
    getGitDir(): Promise<string>;

    getStatus(signal?: AbortSignal): Promise<GitStatus>;
    getSubmodulePaths(signal?: AbortSignal): Promise<ReadonlySet<string>>;
    stashList(signal?: AbortSignal): Promise<readonly GitStash[]>;
    getStashFiles(index: number, signal?: AbortSignal): Promise<readonly GitFileChange[]>;

    getLog(limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getLogForRef(ref: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getLogForPath(pathFilter: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getLogForRefAndPath(ref: string, pathFilter: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getLogForLineRange(filePath: string, startLine: number, endLine: number, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]>;
    getGraphLog(maxCount: number, branches?: readonly string[], pathFilter?: string, filters?: GraphLogFilters, signal?: AbortSignal): Promise<readonly GitGraphCommit[]>;
    getCommitFiles(commitHash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    getCommitMessage(commitHash: string, signal?: AbortSignal): Promise<string>;

    getAllBranches(signal?: AbortSignal): Promise<readonly GitBranch[]>;
    getAllTags(signal?: AbortSignal): Promise<readonly GitTag[]>;
    getCurrentBranch(signal?: AbortSignal): Promise<string>;
    getUserName(signal?: AbortSignal): Promise<string>;
    getRemotes(signal?: AbortSignal): Promise<readonly string[]>;

    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]>;
    addWorktree(worktreePath: string, branch: string, createNew?: boolean, signal?: AbortSignal): Promise<void>;
    removeWorktree(worktreePath: string, force?: boolean, signal?: AbortSignal): Promise<void>;

    getSubmoduleStatus(signal?: AbortSignal): Promise<readonly GitSubmodule[]>;
    updateSubmodule(submodulePath: string, signal?: AbortSignal): Promise<void>;
    updateAllSubmodules(signal?: AbortSignal): Promise<void>;

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

export type { GitExec, GitCommit, GitGraphCommit, GitFileChange, GitStatus, GitStash, GitBranch, GitTag, GitWorktree, GitSubmodule };
