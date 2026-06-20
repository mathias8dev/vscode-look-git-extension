# Commit History Stories

High-level sequence: [commit-history-sequence.mermaid](commit-history-sequence.mermaid)

## Story: Load Cursor-Paged Commit History

As a developer, I want commit history to load with cursor-capable pages so that large repositories stay responsive and history does not drift while loading.

Implementation: [load-paged-history.mermaid](load-paged-history.mermaid)

## Story: Inspect Commit Details and File Changes

As a developer, I want commit details and file changes to load after selection so that the initial history list stays fast.

Implementation: [inspect-commit-details.mermaid](inspect-commit-details.mermaid)

## Story: Open File Diff From History

As a developer, I want to open a file diff from a commit history row so that I can inspect exactly what changed.

Implementation: [open-history-diff.mermaid](open-history-diff.mermaid)

## Story: Cherry-Pick From History

As a developer, I want to cherry-pick a commit from history using a semantic Git action so that the runtime can handle credentials, hooks, and process behavior consistently.

Implementation: [cherry-pick-commit.mermaid](cherry-pick-commit.mermaid)
