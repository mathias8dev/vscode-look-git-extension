# Changelog

All notable changes to Look Git are documented in this file.

## [0.1.0] - 2026-06-02

### Added

#### Changes Panel
- Staged, unstaged, and conflict sections with file-type icons and status letters
- Hover-only inline action buttons (diff, stage, unstage, discard, open)
- Tree and list view modes with depth-based indentation
- Keyboard arrow navigation between file rows; Enter opens diff
- Stash creation via inline prompt in the Changes section header
- Stash panel: expand stash items to browse files and open diffs; apply, pop, drop actions
- Conflict resolution: merge editor launch, Accept Ours / Theirs, Mark Resolved per file

#### Commit History
- Paginated commit list (50 commits per page) with search/filter
- Multi-expand: multiple commits can be open simultaneously
- Each expanded commit shows subject, body, relative date, author, and copy-hash button
- Changed files displayed as a folder tree with click-to-diff support
- Submodule gitlink entries blocked from unsafe diff navigation

#### Git Graph
- SVG lane graph with 10 rotating colors; Bezier curves for merges and forks
- Primary branch (current) pinned to lane 0
- Branch panel: Local / Remote / Worktrees collapsible tree
- WIP rows above each dirty worktree's HEAD commit (staged/unstaged/untracked/conflict counts)
- Commit details side panel: full message, file tree, click-to-diff
- Branch commands: checkout, push, rename, delete, rebase, merge
- Worktree commands: add, remove, open in new window
- Graph filters: search text/hash, branch, author, date range, path
- Pagination with lane continuity across page loads

### Architecture

- Strict 4-layer architecture: `core` (pure logic) → `protocol` (typed messages) → `extension` (VS Code host) → `webview` (React)
- All string union types replaced with TypeScript string enums
- Virtual scrolling for commit graph (row-height 24px, overscan 8)
- `assignLanes` algorithm with primary-branch pinning and locked lanes for pagination

## [0.0.1] - 2026-05-29

### Added

- Initial experimental React-based VS Code extension shell.
