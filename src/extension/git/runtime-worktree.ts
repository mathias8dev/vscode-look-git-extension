import type { GitFileChange } from '@core/git/domain/git-commit';
import type { Page, PageRequest } from '@core/git/domain/page';
import type { GitStash, GitStatus } from '@core/git/domain/git-status';
import type {
    CheckoutOptions,
    CherryPickOptions,
    CleanOptions,
    CommitOptions,
    FileSelection,
    MergeOptions,
    PatchApplyOptions,
    PullOptions,
    RebaseContinuationOptions,
    PushOptions,
    RebaseOptions,
    ResetMode,
    RevertOptions,
    StashOptions,
} from '@application/ports/git-capabilities';
import type { Worktree } from '@application/ports/git-topology';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime, type RepositoryKind } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { HybridGitRuntime } from '@extension/git/hybrid-git-runtime';

export interface RuntimeWorktreeInput {
    readonly repoId: string;
    readonly worktreeId: string;
    readonly path: string;
    readonly gitDir: string;
    readonly repositoryKind: RepositoryKind;
    readonly parentRepositoryId?: string;
    readonly isMain: boolean;
    readonly head: string;
    readonly branch?: string;
    readonly dirty: boolean;
}

export class RuntimeWorktree implements Worktree {
    readonly repoId: string;
    readonly worktreeId: string;
    readonly path: string;
    readonly isMain: boolean;
    readonly head: string;
    readonly branch?: string;
    readonly dirty: boolean;

    private readonly context: GitExecutionContext;

    constructor(
        input: RuntimeWorktreeInput,
        readonly runtime: GitRuntime = new HybridGitRuntime(),
    ) {
        this.repoId = input.repoId;
        this.worktreeId = input.worktreeId;
        this.path = input.path;
        this.isMain = input.isMain;
        this.head = input.head;
        this.branch = input.branch;
        this.dirty = input.dirty;
        this.context = {
            cwd: input.path,
            gitDir: input.gitDir,
            repositoryId: input.repoId,
            worktreeId: input.worktreeId,
            kind: input.repositoryKind,
            parentRepositoryId: input.parentRepositoryId,
        };
    }

    getStatus(signal?: AbortSignal): Promise<GitStatus> {
        return this.execute('getStatus', undefined, signal);
    }

    getUntrackedFiles(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>> {
        return this.execute('getUntrackedFiles', { pageRequest }, signal);
    }

    getIgnoredFiles(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>> {
        return this.execute('getIgnoredFiles', { pageRequest }, signal);
    }

    stage(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('stage', { paths }, signal);
    }

    stageAll(signal?: AbortSignal): Promise<void> {
        return this.execute('stageAll', undefined, signal);
    }

    stageHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('stageHunks', { hunks }, signal);
    }

    stageLines(selection: FileSelection, signal?: AbortSignal): Promise<void> {
        return this.execute('stageLines', { selection }, signal);
    }

    unstage(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('unstage', { paths }, signal);
    }

    unstageAll(signal?: AbortSignal): Promise<void> {
        return this.execute('unstageAll', undefined, signal);
    }

    unstageHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('unstageHunks', { hunks }, signal);
    }

    getFileFromIndex(path: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getFileFromIndex', { path }, signal);
    }

    getConflictStages(path: string, signal?: AbortSignal): Promise<{ readonly base: string; readonly ours: string; readonly theirs: string }> {
        return this.execute('getConflictStages', { path }, signal);
    }

    discard(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('discard', { paths }, signal);
    }

    discardHunks(hunks: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('discardHunks', { hunks }, signal);
    }

    markResolved(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('markResolved', { paths }, signal);
    }

    acceptOurs(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('acceptOurs', { paths }, signal);
    }

    acceptTheirs(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('acceptTheirs', { paths }, signal);
    }

    getFileAtRevision(path: string, revision: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getFileAtRevision', { path, revision }, signal);
    }

    getWorkingTreeDiff(paths: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.execute('getWorkingTreeDiff', { paths }, signal);
    }

    getIndexDiff(paths: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.execute('getIndexDiff', { paths }, signal);
    }

    getCombinedDiff(paths: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.execute('getCombinedDiff', { paths }, signal);
    }

    getPatch(scope: string, paths: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.execute('getPatch', { scope, paths }, signal);
    }

    applyPatch(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('applyPatch', { patch, options }, signal);
    }

    reverseApplyPatch(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('reverseApplyPatch', { patch, options }, signal);
    }

    applyPatchToIndex(patch: string, options: PatchApplyOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('applyPatchToIndex', { patch, options }, signal);
    }

    checkPatch(patch: string, signal?: AbortSignal): Promise<boolean> {
        return this.execute('checkPatch', { patch }, signal);
    }

    commit(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('commit', { message, options }, signal);
    }

    amendCommit(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('amendCommit', { message, options }, signal);
    }

    commitAll(message: string, options: CommitOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('commitAll', { message, options }, signal);
    }

    createFixupCommit(targetCommit: string, message: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('createFixupCommit', { targetCommit, message }, signal);
    }

    createSquashCommit(targetCommit: string, message: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('createSquashCommit', { targetCommit, message }, signal);
    }

    listStashes(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitStash>> {
        return this.execute('listStashes', { pageRequest }, signal);
    }

    getStashFiles(stash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return this.execute('getStashFiles', { stash }, signal);
    }

    getStashSummary(stash: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getStashSummary', { stash }, signal);
    }

    stash(message: string | undefined, options: StashOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('stash', { message, options }, signal);
    }

    applyStash(stash: string, options: StashOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('applyStash', { stash, options }, signal);
    }

    popStash(stash: string, options: StashOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('popStash', { stash, options }, signal);
    }

    dropStash(stash: string, signal?: AbortSignal): Promise<void> {
        return this.execute('dropStash', stash, signal);
    }

    clearStashes(signal?: AbortSignal): Promise<void> {
        return this.execute('clearStashes', undefined, signal);
    }

    branchFromStash(stash: string, branchName: string, signal?: AbortSignal): Promise<void> {
        return this.execute('branchFromStash', { stash, branchName }, signal);
    }

    checkout(ref: string, options: CheckoutOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('checkout', { ref, options }, signal);
    }

    checkoutNewBranch(name: string, startPoint: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('checkoutNewBranch', { name, startPoint }, signal);
    }

    restorePaths(paths: readonly string[], sourceRef: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('restorePaths', { paths, sourceRef }, signal);
    }

    restoreStaged(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('restoreStaged', { paths }, signal);
    }

    restoreWorkingTree(paths: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('restoreWorkingTree', { paths }, signal);
    }

    merge(ref: string, options: MergeOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('merge', { ref, options }, signal);
    }

    continueMerge(signal?: AbortSignal): Promise<void> {
        return this.execute('continueMerge', undefined, signal);
    }

    abortMerge(signal?: AbortSignal): Promise<void> {
        return this.execute('abortMerge', undefined, signal);
    }

    quitMerge(signal?: AbortSignal): Promise<void> {
        return this.execute('quitMerge', undefined, signal);
    }

    rebase(upstream: string, branch: string | undefined, options: RebaseOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('rebase', { upstream, branch, options }, signal);
    }

    continueRebase(options?: RebaseContinuationOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('continueRebase', options, signal);
    }

    abortRebase(signal?: AbortSignal): Promise<void> {
        return this.execute('abortRebase', undefined, signal);
    }

    skipRebase(options?: RebaseContinuationOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('skipRebase', options, signal);
    }

    quitRebase(signal?: AbortSignal): Promise<void> {
        return this.execute('quitRebase', undefined, signal);
    }

    getInteractiveRebasePlan(baseRef: string, headRef: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getInteractiveRebasePlan', { baseRef, headRef }, signal);
    }

    startInteractiveRebase(baseRef: string, plan: string, options: RebaseOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('startInteractiveRebase', { baseRef, plan, options }, signal);
    }

    rewordCommit(commit: string, message: string, signal?: AbortSignal): Promise<void> {
        return this.execute('rewordCommit', { commit, message }, signal);
    }

    squashCommits(commits: readonly string[], message: string, signal?: AbortSignal): Promise<void> {
        return this.execute('squashCommits', { commits, message }, signal);
    }

    fixupCommits(commits: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('fixupCommits', { commits }, signal);
    }

    reorderCommits(orderedCommits: readonly string[], signal?: AbortSignal): Promise<void> {
        return this.execute('reorderCommits', { orderedCommits }, signal);
    }

    editCommit(commit: string, signal?: AbortSignal): Promise<void> {
        return this.execute('editCommit', { commit }, signal);
    }

    dropCommit(commit: string, signal?: AbortSignal): Promise<void> {
        return this.execute('dropCommit', { commit }, signal);
    }

    cherryPick(commit: string, options: CherryPickOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('cherryPick', { commit, options }, signal);
    }

    continueCherryPick(signal?: AbortSignal): Promise<void> {
        return this.execute('continueCherryPick', undefined, signal);
    }

    abortCherryPick(signal?: AbortSignal): Promise<void> {
        return this.execute('abortCherryPick', undefined, signal);
    }

    skipCherryPick(signal?: AbortSignal): Promise<void> {
        return this.execute('skipCherryPick', undefined, signal);
    }

    revertCommit(commit: string, options: RevertOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('revertCommit', { commit, options }, signal);
    }

    continueRevert(signal?: AbortSignal): Promise<void> {
        return this.execute('continueRevert', undefined, signal);
    }

    abortRevert(signal?: AbortSignal): Promise<void> {
        return this.execute('abortRevert', undefined, signal);
    }

    skipRevert(signal?: AbortSignal): Promise<void> {
        return this.execute('skipRevert', undefined, signal);
    }

    resetSoft(ref: string, signal?: AbortSignal): Promise<void> {
        return this.execute('resetSoft', ref, signal);
    }

    resetMixed(ref: string, signal?: AbortSignal): Promise<void> {
        return this.execute('resetMixed', ref, signal);
    }

    resetHard(ref: string, signal?: AbortSignal): Promise<void> {
        return this.execute('resetHard', ref, signal);
    }

    resetKeep(ref: string, signal?: AbortSignal): Promise<void> {
        return this.execute('resetKeep', ref, signal);
    }

    resetPaths(paths: readonly string[], sourceRef: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('resetPaths', { paths, sourceRef }, signal);
    }

    undoLastCommit(mode: ResetMode, signal?: AbortSignal): Promise<void> {
        return this.execute('undoLastCommit', { mode }, signal);
    }

    undoAmend(previousHead: string, signal?: AbortSignal): Promise<void> {
        return this.execute('undoAmend', { previousHead }, signal);
    }

    undoCheckout(previousHead: string, signal?: AbortSignal): Promise<void> {
        return this.execute('undoCheckout', { previousHead }, signal);
    }

    getReflog(pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<string>> {
        return this.execute('getReflog', { pageRequest }, signal);
    }

    restoreFromReflog(entry: string, mode: ResetMode, signal?: AbortSignal): Promise<void> {
        return this.execute('restoreFromReflog', { entry, mode }, signal);
    }

    cleanUntracked(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('cleanUntracked', { paths, options }, signal);
    }

    cleanIgnored(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('cleanIgnored', { paths, options }, signal);
    }

    previewClean(paths: readonly string[], options: CleanOptions, signal?: AbortSignal): Promise<readonly string[]> {
        return this.execute('previewClean', { paths, options }, signal);
    }

    pull(options: PullOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('pull', { options }, signal);
    }

    push(remote: string | undefined, options: PushOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('push', { remote, options }, signal);
    }

    pushBranch(remote: string | undefined, branch: string, options: PushOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('pushBranch', { remote, branch, options }, signal);
    }

    pushRef(remote: string, sourceRef: string, destinationRef: string, options: PushOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('pushRef', { remote, sourceRef, destinationRef, options }, signal);
    }

    pushTags(remote: string, options: PushOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('pushTags', { remote, options }, signal);
    }

    forcePushWithLease(remote: string, branch: string, signal?: AbortSignal): Promise<void> {
        return this.execute('forcePushWithLease', { remote, branch }, signal);
    }

    private execute<TInput, TResult>(operation: SemanticGitOperation, input: TInput, signal?: AbortSignal): Promise<TResult> {
        if (!this.runtime.supports(operation, this.context)) {
            return Promise.reject(new UnsupportedGitOperationError(operation, this.context));
        }
        return this.runtime.execute<TInput, TResult>(operation, this.context, input, signal);
    }
}
