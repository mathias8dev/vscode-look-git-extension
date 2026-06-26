import type { StatusData, StatusEntry, StashEntry, SubmoduleEntry } from '@protocol/changes/types';
import type { BranchInfo, GraphCommit, GraphData, GraphSubmoduleInfo, TagInfo, WorktreeInfo, WorktreeWip } from '@protocol/graph/types';
import type { HistoryCommit, HistoryCommitRef, HistoryData } from '@protocol/history/types';
import type { Pagination } from '@protocol/shared/base';
import type { RepositoryLocator, WorktreeLocator } from '@protocol/shared/repo';

export function statusDataEqual(a: StatusData, b: StatusData): boolean {
    return a.repositoryState === b.repositoryState
        && a.currentBranch === b.currentBranch
        && a.conflictState === b.conflictState
        && statusEntriesEqual(a.staged, b.staged)
        && statusEntriesEqual(a.unstaged, b.unstaged)
        && statusEntriesEqual(a.conflicts, b.conflicts)
        && stashesEqual(a.stashes, b.stashes)
        && submoduleEntriesEqual(a.submodules, b.submodules);
}

export function graphDataEqual(a: GraphData, b: GraphData): boolean {
    return repositoryLocatorEqual(a.repository, b.repository)
        && a.currentBranch === b.currentBranch
        && a.currentUser === b.currentUser
        && a.hasMore === b.hasMore
        && a.loadedCount === b.loadedCount
        && a.totalCount === b.totalCount
        && a.hasRemotes === b.hasRemotes
        && a.repositoryWebUrl === b.repositoryWebUrl
        && branchesEqual(a.branches, b.branches)
        && tagsEqual(a.tags, b.tags)
        && graphCommitsEqual(a.commits, b.commits)
        && worktreesEqual(a.worktrees, b.worktrees)
        && worktreeWipsEqual(a.worktreeWips, b.worktreeWips)
        && graphSubmodulesEqual(a.submodules, b.submodules);
}

export function historyDataEqual(a: HistoryData, b: HistoryData): boolean {
    return a.hasMore === b.hasMore
        && paginationEqual(a.page, b.page)
        && historyCommitsEqual(a.commits, b.commits);
}

export function graphCommitsEqual(a: readonly GraphCommit[], b: readonly GraphCommit[]): boolean {
    return arraysEqual(a, b, graphCommitEqual);
}

export function branchesEqual(a: readonly BranchInfo[], b: readonly BranchInfo[]): boolean {
    return arraysEqual(a, b, branchEqual);
}

export function tagsEqual(a: readonly TagInfo[], b: readonly TagInfo[]): boolean {
    return arraysEqual(a, b, (left, right) => left.name === right.name && left.hash === right.hash);
}

export function worktreesEqual(a: readonly WorktreeInfo[], b: readonly WorktreeInfo[]): boolean {
    return arraysEqual(a, b, worktreeEqual);
}

export function worktreeWipsEqual(a: readonly WorktreeWip[], b: readonly WorktreeWip[]): boolean {
    return arraysEqual(a, b, worktreeWipEqual);
}

export function graphSubmodulesEqual(a: readonly GraphSubmoduleInfo[], b: readonly GraphSubmoduleInfo[]): boolean {
    return arraysEqual(a, b, graphSubmoduleEqual);
}

function statusEntriesEqual(a: readonly StatusEntry[], b: readonly StatusEntry[]): boolean {
    return arraysEqual(a, b, statusEntryEqual);
}

function statusEntryEqual(a: StatusEntry, b: StatusEntry): boolean {
    return a.indexStatus === b.indexStatus
        && a.workTreeStatus === b.workTreeStatus
        && a.filePath === b.filePath
        && a.origPath === b.origPath
        && a.isSubmodule === b.isSubmodule
        && a.submoduleStatus === b.submoduleStatus;
}

function stashesEqual(a: readonly StashEntry[], b: readonly StashEntry[]): boolean {
    return arraysEqual(a, b, (left, right) => left.index === right.index && left.message === right.message);
}

function submoduleEntriesEqual(a: readonly SubmoduleEntry[], b: readonly SubmoduleEntry[]): boolean {
    return arraysEqual(a, b, (left, right) => left.path === right.path && left.name === right.name && left.status === right.status);
}

function graphCommitEqual(a: GraphCommit, b: GraphCommit): boolean {
    return a.hash === b.hash
        && a.shortHash === b.shortHash
        && a.message === b.message
        && a.authorName === b.authorName
        && a.authorEmail === b.authorEmail
        && a.authorDate === b.authorDate
        && a.matchesFilter === b.matchesFilter
        && a.canCherryPick === b.canCherryPick
        && stringArraysEqual(a.parentHashes, b.parentHashes)
        && stringArraysEqual(a.refs, b.refs);
}

function branchEqual(a: BranchInfo, b: BranchInfo): boolean {
    return a.name === b.name
        && a.isRemote === b.isRemote
        && a.isCurrent === b.isCurrent
        && a.hash === b.hash
        && a.upstream === b.upstream
        && a.ahead === b.ahead
        && a.behind === b.behind;
}

function worktreeEqual(a: WorktreeInfo, b: WorktreeInfo): boolean {
    return worktreeLocatorEqual(a.locator, b.locator)
        && a.path === b.path
        && a.head === b.head
        && a.branch === b.branch
        && a.isMain === b.isMain
        && a.isDetached === b.isDetached
        && a.isLocked === b.isLocked
        && a.lockReason === b.lockReason;
}

function worktreeWipEqual(a: WorktreeWip, b: WorktreeWip): boolean {
    return a.path === b.path
        && a.head === b.head
        && a.branch === b.branch
        && a.staged === b.staged
        && a.unstaged === b.unstaged
        && a.untracked === b.untracked
        && a.conflicts === b.conflicts;
}

function graphSubmoduleEqual(a: GraphSubmoduleInfo, b: GraphSubmoduleInfo): boolean {
    return repositoryLocatorEqual(a.repository, b.repository)
        && a.path === b.path
        && a.name === b.name
        && a.status === b.status
        && branchesEqual(a.branches, b.branches)
        && worktreesEqual(a.worktrees, b.worktrees);
}

function historyCommitsEqual(a: readonly HistoryCommit[], b: readonly HistoryCommit[]): boolean {
    return arraysEqual(a, b, historyCommitEqual);
}

function historyCommitEqual(a: HistoryCommit, b: HistoryCommit): boolean {
    return a.hash === b.hash
        && a.shortHash === b.shortHash
        && a.message === b.message
        && a.authorName === b.authorName
        && a.authorDate === b.authorDate
        && a.canCherryPick === b.canCherryPick
        && stringArraysEqual(a.parentHashes, b.parentHashes)
        && historyCommitRefsEqual(a.refs, b.refs);
}

function historyCommitRefsEqual(a: readonly HistoryCommitRef[], b: readonly HistoryCommitRef[]): boolean {
    return arraysEqual(a, b, (left, right) => left.name === right.name && left.kind === right.kind && left.isCurrent === right.isCurrent);
}

function paginationEqual(a: Pagination, b: Pagination): boolean {
    return a.offset === b.offset && a.limit === b.limit;
}

function repositoryLocatorEqual(a: RepositoryLocator | undefined, b: RepositoryLocator | undefined): boolean {
    if (!a || !b) { return a === b; }
    return a.repoId === b.repoId
        && a.kind === b.kind
        && a.path === b.path
        && a.parentRepoId === b.parentRepoId;
}

function worktreeLocatorEqual(a: WorktreeLocator | undefined, b: WorktreeLocator | undefined): boolean {
    if (!a || !b) { return a === b; }
    return a.repoId === b.repoId
        && a.worktreeId === b.worktreeId
        && a.path === b.path;
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
    return arraysEqual(a, b, (left, right) => left === right);
}

function arraysEqual<T>(a: readonly T[], b: readonly T[], itemEqual: (left: T, right: T) => boolean): boolean {
    if (a.length !== b.length) { return false; }
    for (let index = 0; index < a.length; index += 1) {
        const left = a[index];
        const right = b[index];
        if (left === undefined || right === undefined || !itemEqual(left, right)) { return false; }
    }
    return true;
}
