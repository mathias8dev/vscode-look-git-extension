import type { GitCommit, GitFileChange } from '@core/git/domain/git-commit';
import type { Page, PageRequest } from '@core/git/domain/page';
import type { GitBranch, GitStash, GitStatus, GitTag } from '@core/git/domain/git-status';
import type { GitSubmodule, GitWorktree } from '@core/git/domain/git-worktree';

export interface CommitGraphQuery {
    readonly search?: string;
    readonly branches?: readonly string[];
    readonly path?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
}

export interface FileSelection {
    readonly startLine: number;
    readonly endLine: number;
}

export interface ConflictStageContents {
    readonly base: string;
    readonly ours: string;
    readonly theirs: string;
}

export interface RefCompareOptions {
    readonly includeRenames?: boolean;
    readonly ignoreWhitespace?: boolean;
}

export interface FetchOptions {
    readonly prune?: boolean;
    readonly tags?: boolean;
}

export interface AddWorktreeInput {
    readonly path: string;
    readonly branch: string;
    readonly createNew?: boolean;
    readonly startPoint?: string;
}

export interface SubmoduleUpdateOptions {
    readonly init?: boolean;
    readonly recursive?: boolean;
    readonly remote?: boolean;
}

export interface PatchApplyOptions {
    readonly threeWay?: boolean;
    readonly reject?: boolean;
}

export interface CommitOptions {
    readonly signoff?: boolean;
    readonly allowEmpty?: boolean;
}

export interface StashOptions {
    readonly includeUntracked?: boolean;
    readonly keepIndex?: boolean;
    readonly staged?: boolean;
    readonly paths?: readonly string[];
}

export interface CheckoutOptions {
    readonly detach?: boolean;
    readonly force?: boolean;
}

export interface MergeOptions {
    readonly noCommit?: boolean;
    readonly squash?: boolean;
}

export interface RebaseOptions {
    readonly interactive?: boolean;
    readonly autosquash?: boolean;
}

export interface CherryPickOptions {
    readonly noCommit?: boolean;
}

export interface RevertOptions {
    readonly noCommit?: boolean;
    readonly noEdit?: boolean;
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

export interface CleanOptions {
    readonly directories?: boolean;
    readonly force?: boolean;
}

export interface PullOptions {
    readonly rebase?: boolean;
}

export interface PushOptions {
    readonly setUpstream?: boolean;
    readonly forceWithLease?: boolean;
}

export interface GitHistoryOperations {
    getCommitGraph(query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
    getCommitDetails(commit: string, signal?: AbortSignal): Promise<GitCommit>;
    getCommitFiles(commit: string, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    getCommitMessage(commit: string, signal?: AbortSignal): Promise<string>;
    getCommitPatch(commit: string, signal?: AbortSignal): Promise<string>;
    getCommitFileDiff(commit: string, path: string, signal?: AbortSignal): Promise<string>;
    getCommitRange(fromRef: string, toRef: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
    searchCommits(query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
    getMergeBase(leftRef: string, rightRef: string, signal?: AbortSignal): Promise<string>;
    getAheadBehind(localRef: string, upstreamRef: string, signal?: AbortSignal): Promise<{ readonly ahead: number; readonly behind: number }>;
    getReachableCommitHashes(hashes: readonly string[], signal?: AbortSignal): Promise<ReadonlySet<string>>;
    orderCommits(hashes: readonly string[], direction: 'newestFirst' | 'oldestFirst', signal?: AbortSignal): Promise<readonly string[]>;
}

export interface GitFileHistoryOperations {
    getFileHistory(path: string, query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
    getFileSelectionHistory(path: string, selection: FileSelection, query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
    getFileAtRevision(path: string, revision: string, signal?: AbortSignal): Promise<string>;
    getFileRenameHistory(path: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitFileChange>>;
}

export interface GitBlameOperations {
    getBlame(path: string, revision: string | undefined, signal?: AbortSignal): Promise<string>;
    getBlameForSelection(path: string, selection: FileSelection, revision: string | undefined, signal?: AbortSignal): Promise<string>;
    getBlameCommit(commit: string, signal?: AbortSignal): Promise<GitCommit>;
}

export interface GitCompareOperations {
    compareRefs(baseRef: string, headRef: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    compareBranches(baseBranch: string, headBranch: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    compareWithWorkingTree(baseRef: string, worktree: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    compareFiles(baseRef: string, headRef: string, path: string, signal?: AbortSignal): Promise<string>;
    listChangedFiles(baseRef: string, headRef: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitFileChange>>;
}

export interface GitReferenceOperations {
    listBranches(signal?: AbortSignal): Promise<readonly GitBranch[]>;
    listRemoteBranches(signal?: AbortSignal): Promise<readonly GitBranch[]>;
    listTags(signal?: AbortSignal): Promise<readonly GitTag[]>;
    listRemotes(signal?: AbortSignal): Promise<readonly string[]>;
    resolveRef(ref: string, signal?: AbortSignal): Promise<string>;
    getUserName(signal?: AbortSignal): Promise<string>;
    getUpstreamBranch(branch: string, signal?: AbortSignal): Promise<string | undefined>;
}

export interface GitBranchOperations {
    createBranch(name: string, startPoint: string | undefined, signal?: AbortSignal): Promise<void>;
    renameBranch(oldName: string, newName: string, signal?: AbortSignal): Promise<void>;
    deleteBranch(name: string, force: boolean, signal?: AbortSignal): Promise<void>;
    deleteRemoteBranch(remote: string, branch: string, signal?: AbortSignal): Promise<void>;
    setUpstream(branch: string, upstream: string, signal?: AbortSignal): Promise<void>;
}

export interface GitTagOperations {
    createTag(name: string, target: string, message: string | undefined, signal?: AbortSignal): Promise<void>;
    deleteTag(name: string, signal?: AbortSignal): Promise<void>;
}

export interface GitFetchOperations {
    fetch(remote: string, options: FetchOptions, signal?: AbortSignal): Promise<void>;
    fetchAll(options: FetchOptions, signal?: AbortSignal): Promise<void>;
    pruneRemote(remote: string, signal?: AbortSignal): Promise<void>;
    getRemoteUrl(remote: string, signal?: AbortSignal): Promise<string>;
    setRemoteUrl(remote: string, url: string, signal?: AbortSignal): Promise<void>;
    addRemote(name: string, url: string, signal?: AbortSignal): Promise<void>;
    removeRemote(remote: string, signal?: AbortSignal): Promise<void>;
}

export interface GitWorktreeTopologyOperations {
    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]>;
    addWorktree(input: AddWorktreeInput, signal?: AbortSignal): Promise<void>;
    addDetachedWorktree(path: string, ref: string, signal?: AbortSignal): Promise<void>;
    removeWorktree(worktree: string, force: boolean, signal?: AbortSignal): Promise<void>;
    pruneWorktrees(signal?: AbortSignal): Promise<void>;
    repairWorktree(worktree: string, signal?: AbortSignal): Promise<void>;
    lockWorktree(worktree: string, signal?: AbortSignal): Promise<void>;
    unlockWorktree(worktree: string, signal?: AbortSignal): Promise<void>;
}

export interface GitSubmoduleOperations {
    listSubmodules(signal?: AbortSignal): Promise<readonly GitSubmodule[]>;
    getSubmoduleStatus(path: string, signal?: AbortSignal): Promise<GitSubmodule>;
    initSubmodule(path: string, signal?: AbortSignal): Promise<void>;
    updateSubmodule(path: string, options: SubmoduleUpdateOptions, signal?: AbortSignal): Promise<void>;
    syncSubmodule(path: string, signal?: AbortSignal): Promise<void>;
    fetchSubmodule(path: string, signal?: AbortSignal): Promise<void>;
    deinitSubmodule(path: string, force: boolean, signal?: AbortSignal): Promise<void>;
    openSubmoduleRepository(path: string, signal?: AbortSignal): Promise<string>;
}

export interface GitStatusOperations {
    getStatus(signal?: AbortSignal): Promise<GitStatus>;
    getUntrackedFiles(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>>;
    getIgnoredFiles(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>>;
}

export interface GitIndexOperations {
    getFileFromIndex(path: string, signal?: AbortSignal): Promise<string>;
    getConflictStages(path: string, signal?: AbortSignal): Promise<ConflictStageContents>;
    stage(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    stageAll(signal?: AbortSignal): Promise<void>;
    stageHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void>;
    stageLines(selection: FileSelection, signal?: AbortSignal): Promise<void>;
    unstage(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    unstageAll(signal?: AbortSignal): Promise<void>;
    unstageHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void>;
    discard(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    discardHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void>;
    markResolved(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    acceptOurs(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    acceptTheirs(paths: readonly string[], signal?: AbortSignal): Promise<void>;
}

export interface GitPatchOperations {
    getFileAtRevision(path: string, revision: string, signal?: AbortSignal): Promise<string>;
    getWorkingTreeDiff(paths: readonly string[], signal?: AbortSignal): Promise<string>;
    getIndexDiff(paths: readonly string[], signal?: AbortSignal): Promise<string>;
    getCombinedDiff(paths: readonly string[], signal?: AbortSignal): Promise<string>;
    getPatch(scope: string, paths: readonly string[], signal?: AbortSignal): Promise<string>;
    applyPatch(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void>;
    reverseApplyPatch(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void>;
    applyPatchToIndex(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void>;
    checkPatch(patch: string, signal?: AbortSignal): Promise<boolean>;
}

export interface GitCommitOperations {
    commit(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void>;
    amendCommit(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void>;
    commitAll(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void>;
    createFixupCommit(targetCommit: string, message: string | undefined, signal?: AbortSignal): Promise<void>;
    createSquashCommit(targetCommit: string, message: string | undefined, signal?: AbortSignal): Promise<void>;
}

export interface GitStashOperations {
    listStashes(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitStash>>;
    getStashFiles(stash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    getStashSummary(stash: string, signal?: AbortSignal): Promise<string>;
    stash(message: string | undefined, options: StashOptions, signal?: AbortSignal): Promise<void>;
    applyStash(stash: string, options: StashOptions, signal?: AbortSignal): Promise<void>;
    popStash(stash: string, options: StashOptions, signal?: AbortSignal): Promise<void>;
    dropStash(stash: string, signal?: AbortSignal): Promise<void>;
    clearStashes(signal?: AbortSignal): Promise<void>;
    branchFromStash(stash: string, branchName: string, signal?: AbortSignal): Promise<void>;
}

export interface GitCheckoutOperations {
    checkout(ref: string, options: CheckoutOptions, signal?: AbortSignal): Promise<void>;
    checkoutNewBranch(name: string, startPoint: string | undefined, signal?: AbortSignal): Promise<void>;
    restorePaths(paths: readonly string[], sourceRef: string | undefined, signal?: AbortSignal): Promise<void>;
    restoreStaged(paths: readonly string[], signal?: AbortSignal): Promise<void>;
    restoreWorkingTree(paths: readonly string[], signal?: AbortSignal): Promise<void>;
}

export interface GitMergeOperations {
    merge(ref: string, options: MergeOptions, signal?: AbortSignal): Promise<void>;
    continueMerge(signal?: AbortSignal): Promise<void>;
    abortMerge(signal?: AbortSignal): Promise<void>;
    quitMerge(signal?: AbortSignal): Promise<void>;
}

export interface GitRebaseOperations {
    rebase(upstream: string, branch: string | undefined, options: RebaseOptions, signal?: AbortSignal): Promise<void>;
    continueRebase(signal?: AbortSignal): Promise<void>;
    abortRebase(signal?: AbortSignal): Promise<void>;
    skipRebase(signal?: AbortSignal): Promise<void>;
    quitRebase(signal?: AbortSignal): Promise<void>;
}

export interface GitInteractiveRebaseOperations {
    getInteractiveRebasePlan(baseRef: string, headRef: string, signal?: AbortSignal): Promise<string>;
    startInteractiveRebase(baseRef: string, plan: string, options: RebaseOptions, signal?: AbortSignal): Promise<void>;
    rewordCommit(commit: string, message: string, signal?: AbortSignal): Promise<void>;
    squashCommits(commits: readonly string[], message: string, signal?: AbortSignal): Promise<void>;
    fixupCommits(commits: readonly string[], signal?: AbortSignal): Promise<void>;
    reorderCommits(orderedCommits: readonly string[], signal?: AbortSignal): Promise<void>;
    editCommit(commit: string, signal?: AbortSignal): Promise<void>;
    dropCommit(commit: string, signal?: AbortSignal): Promise<void>;
}

export interface GitCherryPickRevertOperations {
    cherryPick(commit: string, options: CherryPickOptions, signal?: AbortSignal): Promise<void>;
    continueCherryPick(signal?: AbortSignal): Promise<void>;
    abortCherryPick(signal?: AbortSignal): Promise<void>;
    skipCherryPick(signal?: AbortSignal): Promise<void>;
    revertCommit(commit: string, options: RevertOptions, signal?: AbortSignal): Promise<void>;
    continueRevert(signal?: AbortSignal): Promise<void>;
    abortRevert(signal?: AbortSignal): Promise<void>;
    skipRevert(signal?: AbortSignal): Promise<void>;
}

export interface GitResetUndoOperations {
    resetSoft(ref: string, signal?: AbortSignal): Promise<void>;
    resetMixed(ref: string, signal?: AbortSignal): Promise<void>;
    resetHard(ref: string, signal?: AbortSignal): Promise<void>;
    resetKeep(ref: string, signal?: AbortSignal): Promise<void>;
    resetPaths(paths: readonly string[], sourceRef: string | undefined, signal?: AbortSignal): Promise<void>;
    undoLastCommit(mode: ResetMode, signal?: AbortSignal): Promise<void>;
    undoAmend(previousHead: string, signal?: AbortSignal): Promise<void>;
    undoCheckout(previousHead: string, signal?: AbortSignal): Promise<void>;
    getReflog(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>>;
    restoreFromReflog(entry: string, mode: ResetMode, signal?: AbortSignal): Promise<void>;
}

export interface GitCleanOperations {
    cleanUntracked(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<void>;
    cleanIgnored(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<void>;
    previewClean(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<readonly string[]>;
}

export interface GitPullPushOperations {
    pull(options: PullOptions, signal?: AbortSignal): Promise<void>;
    push(remote: string | undefined, options: PushOptions, signal?: AbortSignal): Promise<void>;
    pushBranch(remote: string | undefined, branch: string, options: PushOptions, signal?: AbortSignal): Promise<void>;
    pushRef(remote: string, sourceRef: string, destinationRef: string, options: PushOptions, signal?: AbortSignal): Promise<void>;
    pushTags(remote: string, options: PushOptions, signal?: AbortSignal): Promise<void>;
    forcePushWithLease(remote: string, branch: string, signal?: AbortSignal): Promise<void>;
}
