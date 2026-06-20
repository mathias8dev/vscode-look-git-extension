# Git Semantic Operations

This catalog defines the target semantic operation surface for Look Git. It is not a claim that every operation exists in the current implementation.

The operation names are domain actions. They are not raw git argv, and they are not protocol message names. A `GitRepository` or `Worktree` exposes only the capabilities it can actually support. Unsupported operations fail with `UnsupportedGitOperationError`.

Cursor-paged operations use the cursor contract in [pagination-cursors.md](pagination-cursors.md). Guarded operations use the policy in [operation-guards.md](operation-guards.md).

## Repository-Scoped Operations

Repository-scoped operations do not require a mutable checkout unless explicitly stated.

### History

- `getCommitGraph(query, pageRequest, signal)`: load cursor-paged commits for graph/history.
- `getCommitDetails(commit, signal)`: load full commit metadata, message, parents, refs, and changed files.
- `getCommitPatch(commit, signal)`: load a patch for a commit.
- `getCommitFileDiff(commit, path, signal)`: load left/right file contents or diff inputs for a commit path.
- `getCommitRange(fromRef, toRef, pageRequest, signal)`: load commits reachable from one ref but not another.
- `searchCommits(query, pageRequest, signal)`: search commits by message, author, hash, path, or date filters.
- `getMergeBase(leftRef, rightRef, signal)`: compute the common ancestor used by compare and rebase flows.
- `getAheadBehind(localRef, upstreamRef, signal)`: compute ahead/behind counts.

### File History

- `getFileHistory(path, query, pageRequest, signal)`: load cursor-paged history for a file path.
- `getFileSelectionHistory(path, selection, query, pageRequest, signal)`: load history for a line/range selection.
- `getFileAtRevision(path, revision, signal)`: read a file snapshot at a revision.
- `getFileRenameHistory(path, pageRequest, signal)`: follow path renames for file history.

### Blame

- `getBlame(path, revision, signal)`: load blame for a file revision.
- `getBlameForSelection(path, selection, revision, signal)`: load blame for selected lines.
- `getBlameCommit(commit, signal)`: load commit details for a blamed line.

### Compare

- `compareRefs(baseRef, headRef, options, signal)`: compare any two refs.
- `compareBranches(baseBranch, headBranch, options, signal)`: compare two branches.
- `compareWithWorkingTree(baseRef, worktree, options, signal)`: compare a ref with a checkout.
- `compareFiles(baseRef, headRef, path, signal)`: compare one file across refs.
- `listChangedFiles(baseRef, headRef, pageRequest, signal)`: cursor-page changed files for a comparison.

### References

- `listBranches(signal)`: list local branches.
- `listRemoteBranches(signal)`: list remote-tracking branches.
- `listTags(signal)`: list tags.
- `listRemotes(signal)`: list remotes.
- `resolveRef(ref, signal)`: resolve a ref to a commit.
- `createBranch(name, startPoint, signal)`: create a branch.
- `renameBranch(oldName, newName, signal)`: rename a branch.
- `deleteBranch(name, force, signal)`: delete a branch.
- `setUpstream(branch, upstream, signal)`: set branch upstream.
- `createTag(name, target, message, signal)`: create lightweight or annotated tag.
- `deleteTag(name, signal)`: delete tag.

### Fetch and Remote Metadata

- `fetch(remote, options, signal)`: fetch from a remote.
- `fetchAll(options, signal)`: fetch all remotes.
- `pruneRemote(remote, signal)`: prune stale remote-tracking refs.
- `getRemoteUrl(remote, signal)`: read a remote URL.
- `setRemoteUrl(remote, url, signal)`: update a remote URL.

### Worktree Topology

- `listWorktrees(signal)`: list main and linked worktrees for the repository.
- `addWorktree(input, signal)`: add a linked worktree.
- `removeWorktree(worktree, force, signal)`: remove a linked worktree.
- `pruneWorktrees(signal)`: prune stale worktree metadata.
- `repairWorktree(worktree, signal)`: repair worktree administrative metadata when supported.

### Submodules

- `listSubmodules(signal)`: list submodule links from parent metadata; initialized submodules include child repository id and child head.
- `getSubmoduleStatus(path, signal)`: inspect one submodule link.
- `initSubmodule(path, signal)`: initialize a submodule.
- `updateSubmodule(path, options, signal)`: update a submodule.
- `syncSubmodule(path, signal)`: sync submodule URLs.
- `fetchSubmodule(path, signal)`: fetch inside an initialized submodule.
- `deinitSubmodule(path, force, signal)`: deinitialize a submodule.
- `openSubmoduleRepository(path, signal)`: resolve initialized submodule repository locator.

## Worktree-Scoped Operations

Worktree-scoped operations require a concrete checkout.

### Status and Index

- `getStatus(signal)`: load staged, unstaged, untracked, conflicted, ignored, and submodule status.
- `getUntrackedFiles(pageRequest, signal)`: cursor-page untracked files.
- `getIgnoredFiles(pageRequest, signal)`: cursor-page ignored files when requested.
- `stage(paths, signal)`: stage paths.
- `stageAll(signal)`: stage all changes.
- `stageHunks(hunks, signal)`: stage selected hunks.
- `stageLines(selection, signal)`: stage selected lines.
- `unstage(paths, signal)`: unstage paths.
- `unstageAll(signal)`: unstage all staged changes.
- `unstageHunks(hunks, signal)`: unstage selected hunks.
- `discard(paths, signal)`: discard unstaged changes.
- `discardHunks(hunks, signal)`: discard selected hunks.
- `markResolved(paths, signal)`: mark conflict paths as resolved.

### Patch and Diff

- `getWorkingTreeDiff(paths, signal)`: diff worktree against index.
- `getIndexDiff(paths, signal)`: diff index against `HEAD`.
- `getCombinedDiff(paths, signal)`: diff worktree and index against `HEAD`.
- `getPatch(scope, paths, signal)`: produce a patch for a scope.
- `applyPatch(patch, options, signal)`: apply a patch.
- `reverseApplyPatch(patch, options, signal)`: reverse-apply a patch.
- `applyPatchToIndex(patch, options, signal)`: apply a patch to index only.
- `checkPatch(patch, signal)`: validate whether a patch can apply.

### Commit

- `commit(message, options, signal)`: create a commit.
- `amendCommit(message, options, signal)`: amend `HEAD`.
- `commitAll(message, options, signal)`: stage tracked changes and commit.
- `createFixupCommit(targetCommit, message, signal)`: create a fixup commit.
- `createSquashCommit(targetCommit, message, signal)`: create a squash commit.

### Stash

- `listStashes(pageRequest, signal)`: cursor-page stash entries.
- `stash(message, options, signal)`: create a stash.
- `applyStash(stash, options, signal)`: apply a stash.
- `popStash(stash, options, signal)`: pop a stash.
- `dropStash(stash, signal)`: drop a stash.
- `clearStashes(signal)`: clear all stashes.
- `branchFromStash(stash, branchName, signal)`: create a branch from a stash.

### Checkout and Restore

- `checkout(ref, options, signal)`: checkout branch, tag, or commit in the worktree.
- `checkoutNewBranch(name, startPoint, signal)`: create and checkout a branch.
- `restorePaths(paths, sourceRef, signal)`: restore paths from a source ref.
- `restoreStaged(paths, signal)`: restore staged paths back to unstaged.
- `restoreWorkingTree(paths, signal)`: restore working tree paths.

### Merge

- `merge(ref, options, signal)`: merge a ref into the current branch.
- `continueMerge(signal)`: continue after conflicts are resolved.
- `abortMerge(signal)`: abort an in-progress merge.
- `quitMerge(signal)`: quit merge state without resetting worktree when supported.

### Rebase

- `rebase(upstream, branch, options, signal)`: start a non-interactive rebase.
- `continueRebase(signal)`: continue an in-progress rebase.
- `abortRebase(signal)`: abort an in-progress rebase.
- `skipRebase(signal)`: skip the current rebase commit.
- `quitRebase(signal)`: quit rebase state when supported.

### Interactive Rebase

- `getInteractiveRebasePlan(baseRef, headRef, signal)`: build the editable rebase todo model.
- `startInteractiveRebase(baseRef, plan, options, signal)`: start interactive rebase from a plan.
- `rewordCommit(commit, message, signal)`: reword a commit through interactive rebase.
- `squashCommits(commits, message, signal)`: squash commits.
- `fixupCommits(commits, signal)`: fixup commits.
- `reorderCommits(orderedCommits, signal)`: reorder commits.
- `editCommit(commit, signal)`: stop at a commit for editing.
- `dropCommit(commit, signal)`: drop a commit from the branch history.

### Cherry-Pick and Revert

- `cherryPick(commit, options, signal)`: cherry-pick a commit.
- `continueCherryPick(signal)`: continue after conflicts are resolved.
- `abortCherryPick(signal)`: abort cherry-pick.
- `skipCherryPick(signal)`: skip current cherry-pick commit.
- `revertCommit(commit, options, signal)`: create a revert commit.
- `continueRevert(signal)`: continue after revert conflicts are resolved.
- `abortRevert(signal)`: abort revert.
- `skipRevert(signal)`: skip current revert commit.

### Reset and Undo

- `resetSoft(ref, signal)`: move `HEAD` and keep index/worktree.
- `resetMixed(ref, signal)`: move `HEAD` and reset index.
- `resetHard(ref, signal)`: move `HEAD`, index, and worktree.
- `resetPaths(paths, sourceRef, signal)`: reset selected paths.
- `undoLastCommit(mode, signal)`: undo the last commit with soft, mixed, or hard behavior.
- `undoAmend(previousHead, signal)`: recover the pre-amend state when available.
- `undoCheckout(previousHead, signal)`: return to the previous checkout when available.
- `getReflog(pageRequest, signal)`: cursor-page reflog entries for recovery flows.
- `restoreFromReflog(entry, mode, signal)`: restore state from a reflog entry.

### Clean

- `cleanUntracked(paths, options, signal)`: remove untracked files.
- `cleanIgnored(paths, options, signal)`: remove ignored files when explicitly requested.
- `previewClean(paths, options, signal)`: preview files that would be cleaned.

### Pull and Push

- `pull(options, signal)`: update current branch in the worktree.
- `push(remote, options, signal)`: push current branch or configured refspec.
- `pushBranch(remote, branch, options, signal)`: push a named branch.
- `pushTags(remote, options, signal)`: push tags.
- `forcePushWithLease(remote, branch, signal)`: force push with lease.

## Runtime Selection Rules

- Local read-only operations normally use `CliGitRuntime`.
- Mutating local operations normally use `CliGitRuntime`.
- Remote operations may use `VscodeGitRuntime`, `LookNativeGitRuntime`, or `CliGitRuntime`.
- `HybridGitRuntime` selects the first runtime that supports the operation and has the required execution context or credentials.
- Runtime methods receive `GitExecutionContext`, not protocol locators.

## Protocol Rule

Each operation that crosses the webview boundary becomes a typed protocol message in the owning feature slice. Do not send an open-ended `command: string`.
