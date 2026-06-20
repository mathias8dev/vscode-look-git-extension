# User Stories

These stories describe the current three Look Git webviews against the target architecture. They intentionally use architecture terms from the diagrams:

- `RepositoryLocator` and `WorktreeLocator` are protocol-safe handles sent by webviews.
- `RepositoryRegistry` resolves locators into runtime `GitRepository` and `Worktree` objects.
- `GitRepository` and `Worktree` expose smaller semantic operation capabilities instead of one broad interface.
- `GitRuntime` chooses how semantic operations execute from execution facts: CLI, VS Code Git runtime, or a future Look-native runtime.

## Changes Webview

As a developer, I want to see the current worktree status so that I can review staged, unstaged, conflicted, untracked, stash, and submodule changes from one panel.

As a developer, I want to stage, unstage, discard, stash, and commit changes from the current worktree so that I can complete common local Git workflows without leaving Look Git.

As a developer working inside a submodule or linked worktree, I want the same Changes UI to operate on the selected runtime worktree, not on an implicit global cwd.

Sequence: [changes/status-and-commit-sequence.mermaid](changes/status-and-commit-sequence.mermaid)

## Commit History Webview

As a developer, I want a cursor-paged commit history for the selected repository so that large repositories remain responsive.

As a developer, I want to select a commit and load details lazily so that file lists and commit messages do not block the initial history view.

As a developer, I want file history to use the same repository locator and page model as repository history so that main repositories and submodules behave consistently.

Sequence: [commit-history/commit-history-sequence.mermaid](commit-history/commit-history-sequence.mermaid)

## Look Graph Webview

As a developer, I want a cursor-capable graph page of commits, branches, tags, worktrees, and submodules so that I can understand repository topology.

As a developer, I want linked worktrees to appear as checkouts that belong to a repository, and submodules to appear as linked repositories, so that the UI matches Git's actual model.

As a developer, I want automatic refresh to update graph data without visually rebuilding unchanged UI state so that background Git watcher events do not blink the webview.

Sequence: [look-graph/look-graph-sequence.mermaid](look-graph/look-graph-sequence.mermaid)

## Shared Repository Context

As a developer with multiple repositories open, I want all webviews to move to the active repository together so that Changes, History, and Graph are consistent.

As a developer, I want each webview to reset local feature state and request fresh cursor-capable data after a context change so that no stale repository facts remain visible.

Sequence: [shared/repo-context-change-sequence.mermaid](shared/repo-context-change-sequence.mermaid)
