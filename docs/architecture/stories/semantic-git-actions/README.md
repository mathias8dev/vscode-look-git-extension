# Semantic Git Action Stories

These stories are close to exhaustive for the semantic operation families currently declared by Look Git. They are still user stories, not command documentation: each story describes user intent, architectural routing, and special cases that should be tested when the implementation reaches that surface.

The boundary remains the same for every story: webviews send typed intent and locators, the extension resolves repository/worktree context, use cases validate guards, and runtimes execute semantic git operations.

## Story: Load, Search, And Inspect Repository History

As a developer, I want graph and history views to page, search, and inspect commits without loading unbounded history so that large repositories stay responsive.

Semantic actions: `getCommitGraph`, `getCommitDetails`, `getCommitFiles`, `getCommitMessage`, `getCommitPatch`, `getCommitFileDiff`, `getCommitRange`, `searchCommits`, `getMergeBase`, `getAheadBehind`, `getReachableCommitHashes`, `orderCommits`

Special cases:

- Search combines author, date, branch, path, and text filters while preserving cursor stability.
- Commit detail loading is cancelled when the user selects another commit before the first request finishes.
- Merge-base and ahead/behind calculations are scoped to the selected repository, not the active editor folder.
- Reachability and ordering reject commits outside the current branch before rewrite actions start.

## Story: Follow File History, Renames, And Blame

As a developer, I want file history and blame to follow selected files, selected lines, and renames so that I can answer why a line changed even after a path moved.

Semantic actions: `getFileHistory`, `getFileSelectionHistory`, `getFileAtRevision`, `getFileRenameHistory`, `getBlame`, `getBlameForSelection`, `getBlameCommit`

Special cases:

- A selected line range spans a renamed file boundary.
- The file no longer exists at the selected revision.
- Blame for a line points to a commit outside the current branch filter.
- A binary file should expose metadata without attempting text rendering.

## Story: Compare Refs, Branches, Files, And Worktrees

As a developer, I want comparisons to work between refs, branches, single files, and a concrete worktree so that review actions always compare the intended repository state.

Semantic actions: `compareRefs`, `compareBranches`, `compareWithWorkingTree`, `compareFiles`, `listChangedFiles`

Special cases:

- The base ref and head ref live in different remotes with the same short branch name.
- Rename detection changes the changed-file list and must keep pagination stable.
- A worktree comparison uses the worktree path from its locator, not a process cwd fallback.
- File comparison refuses gitlink diffs and returns submodule metadata instead.

## Story: Manage References And Remote Metadata

As a developer, I want branch, tag, remote, and upstream operations to be semantic actions so that the UI never builds raw refspec commands.

Semantic actions: `listBranches`, `listRemoteBranches`, `listTags`, `listRemotes`, `resolveRef`, `updateRef`, `getUserName`, `getUpstreamBranch`, `createBranch`, `renameBranch`, `deleteBranch`, `deleteRemoteBranch`, `setUpstream`, `createTag`, `deleteTag`, `fetch`, `fetchAll`, `pruneRemote`, `getRemoteUrl`, `setRemoteUrl`, `addRemote`, `removeRemote`

Special cases:

- Remote name is not `origin`; every remote operation uses the resolved remote.
- Branch deletion distinguishes merged, unmerged, and remote-tracking branches.
- A branch rename must preserve upstream when git supports it, or report the missing recovery step.
- Remote URL updates and removals require confirmation when the remote is used as an upstream.

## Story: Review And Stage Worktree State

As a developer, I want status, staging, unstaging, conflicts, and partial selections to operate on the selected worktree so that linked worktrees and submodules are not mixed together.

Semantic actions: `getStatus`, `getUntrackedFiles`, `getIgnoredFiles`, `stage`, `stageAll`, `stageHunks`, `stageLines`, `unstage`, `unstageAll`, `unstageHunks`, `getFileFromIndex`, `getConflictStages`, `discard`, `discardHunks`, `markResolved`, `acceptOurs`, `acceptTheirs`

Special cases:

- A folder selection contains staged, unstaged, untracked, ignored, and conflicted entries.
- Hunk and line staging are rejected for binary files and gitlinks.
- Conflict stages are missing for a file because it was already resolved outside Look Git.
- Discarding hunks requires preview and confirmation when local edits would be lost.

## Story: Apply, Reverse, And Validate Patches

As a developer, I want patch operations to be checked and applied through semantic actions so that conflicts, index-only applies, and reverse applies are reported consistently.

Semantic actions: `getWorkingTreeDiff`, `getIndexDiff`, `getCombinedDiff`, `getPatch`, `applyPatch`, `reverseApplyPatch`, `applyPatchToIndex`, `checkPatch`

Special cases:

- A patch applies cleanly to the worktree but not to the index.
- Three-way patch application creates conflicts and must surface conflicted paths.
- Reverse apply is destructive and requires preview of affected paths.
- A patch contains paths outside the repository root and must be rejected.

## Story: Commit, Amend, And Create Autosquash Commits

As a developer, I want commit creation and amend flows to run as semantic actions so that signing, empty commits, and autosquash intent remain explicit.

Semantic actions: `commit`, `amendCommit`, `commitAll`, `createFixupCommit`, `createSquashCommit`

Special cases:

- Commit message generation succeeds after the staged set changes and must use the latest status.
- Amend requires recovery of the previous `HEAD`.
- Commit-all stages tracked files only and does not silently include untracked files.
- Fixup and squash commits validate that the target commit is reachable.

## Story: Manage Stashes

As a developer, I want stash operations to be scoped to the selected worktree so that stash previews, file lists, and destructive drops do not cross repository contexts.

Semantic actions: `listStashes`, `getStashFiles`, `getStashSummary`, `stash`, `applyStash`, `popStash`, `dropStash`, `clearStashes`, `branchFromStash`

Special cases:

- Stash list is cursor-paged and the selected stash disappears after an external drop.
- Pop applies changes but conflicts, so the stash must remain recoverable.
- Stashing only staged files should preserve unstaged files.
- Clearing all stashes requires a destructive confirmation and a recovery explanation when recovery is impossible.

## Story: Checkout And Restore Paths

As a developer, I want checkout and restore actions to distinguish branch navigation from path restoration so that Look Git does not overwrite local work accidentally.

Semantic actions: `checkout`, `checkoutNewBranch`, `restorePaths`, `restoreStaged`, `restoreWorkingTree`

Special cases:

- Checkout of a commit enters detached HEAD and updates the worktree context label.
- Checkout of a branch already checked out in another linked worktree offers opening that worktree instead.
- Restore paths from a source ref rejects unresolved conflicts unless the operation explicitly targets conflict resolution.
- Restoring staged paths preserves unstaged edits for the same file.

## Story: Merge And Rebase Branches

As a developer, I want merge and rebase lifecycle actions to be semantic operations so that in-progress states, conflict recovery, and abort flows are consistent.

Semantic actions: `merge`, `continueMerge`, `abortMerge`, `quitMerge`, `rebase`, `continueRebase`, `abortRebase`, `skipRebase`, `quitRebase`

Special cases:

- A merge starts with `noCommit` and leaves staged merge results for review.
- A rebase with autosquash must reject dirty worktrees before git starts.
- Continue is disabled until all conflicts are resolved.
- Quit preserves worktree changes while abort restores the pre-operation branch state.

## Story: Rewrite Selected Commits

As a developer, I want interactive rewrite actions to validate selection order and reachability before starting an interactive rebase so that Look Git does not rewrite an unintended range.

Implementation: [rewrite-selected-commits.mermaid](rewrite-selected-commits.mermaid)

Semantic actions: `getInteractiveRebasePlan`, `startInteractiveRebase`, `rewordCommit`, `squashCommits`, `fixupCommits`, `reorderCommits`, `editCommit`, `dropCommit`

Special cases:

- The user selects commits out of visual order.
- One selected commit is not reachable from the current branch and must block the action.
- Reordering across a merge commit requires an explicit unsupported-operation error until supported.
- A merge, rebase, cherry-pick, or revert is already in progress.

## Story: Continue Or Abort A Conflicted Git Action

As a developer, I want conflict-producing actions to expose continue and abort commands through semantic git actions so that recovery does not depend on raw git commands in the UI.

Implementation: [continue-or-abort-conflicted-action.mermaid](continue-or-abort-conflicted-action.mermaid)

Semantic actions: `cherryPick`, `continueCherryPick`, `abortCherryPick`, `skipCherryPick`, `revertCommit`, `continueRevert`, `abortRevert`, `skipRevert`

Special cases:

- Cherry-pick creates conflicts and must not post a success refresh.
- Continue is disabled until conflicted paths are marked resolved.
- Skip is available for cherry-pick/revert sequences, but not for a single completed operation.
- Abort restores the pre-operation worktree context and refreshes status/history.

## Story: Reset, Undo, And Recover From Reflog

As a developer, I want reset and undo actions to expose their destructive scope and recovery handles so that history movement is deliberate and auditable.

Implementation: [reset-current-branch-with-preview.mermaid](reset-current-branch-with-preview.mermaid)

Semantic actions: `resetSoft`, `resetMixed`, `resetHard`, `resetKeep`, `resetPaths`, `undoLastCommit`, `undoAmend`, `undoCheckout`, `getReflog`, `restoreFromReflog`

Special cases:

- Reset-hard target is not `HEAD`, and the worktree has both staged and unstaged changes.
- Reset-keep refuses when local changes would be overwritten.
- Undo-amend uses the pre-amend head recorded before the amend action.
- Reflog recovery is cursor-paged and must show stale entries when the object was garbage-collected.

## Story: Clean Untracked And Ignored Files

As a developer, I want cleaning operations to preview exactly what will be removed so that generated files, ignored files, and directories are never deleted silently.

Semantic actions: `cleanUntracked`, `cleanIgnored`, `previewClean`

Special cases:

- Cleaning ignored files requires stronger confirmation than cleaning ordinary untracked files.
- Directory cleaning previews nested files and empty directories separately.
- A path becomes tracked after preview and before acknowledgement; validation must reject the stale plan.
- Cleaning a submodule worktree must not remove parent repository files.

## Story: Pull, Push, And Force Push With Lease

As a developer, I want remote synchronization to use semantic actions so that upstream discovery, credentials, lease previews, and branch refspecs are handled outside the UI.

Implementation: [force-push-with-lease.mermaid](force-push-with-lease.mermaid)

Semantic actions: `pull`, `push`, `pushBranch`, `pushRef`, `pushTags`, `forcePushWithLease`

Special cases:

- Pull with rebase is rejected when another operation is in progress.
- Push with no upstream offers set-upstream behavior instead of assuming a remote.
- Force-with-lease previews ahead/behind counts and rejects stale acknowledgements after a background fetch.
- The first runtime lacks credentials, so `HybridGitRuntime` selects another runtime that supports the operation for the same context.

## Story: Manage Linked Worktrees

As a developer, I want linked worktree operations to be repository-scoped semantic actions so that path, branch, lock, repair, and removal behavior does not rely on current process cwd.

Implementation: [remove-linked-worktree-safely.mermaid](remove-linked-worktree-safely.mermaid)

Semantic actions: `listWorktrees`, `addWorktree`, `addDetachedWorktree`, `removeWorktree`, `pruneWorktrees`, `repairWorktree`, `lockWorktree`, `unlockWorktree`

Special cases:

- The selected worktree is the main worktree and removal must be rejected before confirmation.
- A branch is already checked out in another worktree, so add-worktree must ask for a new branch name or open the existing worktree.
- A detached worktree records the source ref and shows detached state in the graph.
- A locked dirty worktree requires unlock plus force acknowledgement before removal.

## Story: Manage Submodules As Repositories

As a developer, I want submodule actions to treat gitlinks as repository boundaries so that status, update, fetch, and open behavior never pretends a submodule is an ordinary file.

Semantic actions: `listSubmodules`, `getSubmoduleStatus`, `initSubmodule`, `updateSubmodule`, `syncSubmodule`, `fetchSubmodule`, `deinitSubmodule`, `openSubmoduleRepository`

Special cases:

- An uninitialized submodule can be initialized or updated but cannot be opened as a repository.
- Dirty detection runs inside the submodule worktree while registered commit comparison runs in the parent.
- Deinitializing a dirty submodule requires destructive confirmation and recovery explanation.
- Opening a submodule creates or selects a child repository context instead of sharing parent webview state.
