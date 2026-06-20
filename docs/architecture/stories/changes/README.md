# Changes Stories

High-level sequence: [status-and-commit-sequence.mermaid](status-and-commit-sequence.mermaid)

## Story: Review Worktree Status

As a developer, I want the Changes webview to show staged, unstaged, untracked, conflicted, stash, and submodule changes for the selected worktree so that I can review local state without guessing which repository context is active.

Implementation: [review-worktree-status.mermaid](review-worktree-status.mermaid)

## Story: Stage and Commit Selected Changes

As a developer, I want to stage selected changes and commit them through semantic git actions so that the UI does not need to know raw git arguments.

Implementation: [stage-and-commit.mermaid](stage-and-commit.mermaid)

## Story: Stash Current Worktree Changes

As a developer, I want to stash changes in the selected worktree so that linked worktrees and submodule worktrees behave the same as the main worktree.

Implementation: [stash-worktree.mermaid](stash-worktree.mermaid)

## Story: Open and Update Submodule From Changes

As a developer, I want gitlink/submodule rows to expose submodule-specific actions without treating submodules as files.

Implementation: [submodule-row-actions.mermaid](submodule-row-actions.mermaid)
