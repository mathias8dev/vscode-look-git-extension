# Changelog

All notable changes to Look Git are documented in this file.

## [0.9.1] - 2026-06-05

### Fixed

#### Changes Panel
- Open conflicted files, including submodule conflicts, directly in VS Code's modern 3-way merge editor using Git conflict stages

## [0.9.0] - 2026-06-05

### Added

#### Look Graph
- Add explicit empty states for repositories with no commits and filtered graphs with no matching commits
- Add actionable graph errors with retry and output details, plus keyboard navigation between commits with Arrow Up and Arrow Down
- Add branch badges for local branches that have remotes available but are not published yet

#### Tooling
- Add `lookGit` fixture scenarios for empty repositories, remote-only repositories, unpublished branches, and unavailable remotes
- Add UX reference SVGs for graph empty states, actionable errors, keyboard navigation, operation feedback, and special Git states

### Changed

#### Changes Panel
- Show a clear-filters action when filtering hides every change row

#### Commit History
- Show a clear-filters action when commit search has no matches

## [0.8.0] - 2026-06-05

### Added

#### AI
- Add `Explain this diff` for selected Changes rows, Look Graph commits, and Commit History commits using the VS Code language model API
- Add review buttons to Changes, Staged, and submodule change bars to explain patchable diffs from the current section or submodule
- Support explaining staged, unstaged, untracked, multi-file, multi-commit, and submodule-scoped diffs in read-only Markdown documents

### Changed

#### Changes Panel
- Default the changes view to list mode while preserving the user's selected list/tree mode in VS Code webview state

### Fixed

#### Commit History
- Show an empty history state instead of a Git error for initialized repositories that do not have any commits yet

#### Look Graph
- Handle repositories without a local `HEAD` commit while still rendering fetched remote refs when available

## [0.7.0] - 2026-06-05

### Added

#### Changes Panel
- Add `Apply Patch...` to the native Changes panel menu and Command Palette, with clipboard/file sources, working-tree or staged apply modes, preflight validation, conflict-aware refresh, output details, and VS Code toast feedback
- Add `Create Patch...` for selected change rows, including staged, unstaged, untracked, and submodule-scoped selections with copy-to-clipboard or save-to-file destinations

## [0.6.0] - 2026-06-04

### Added

#### Changes Panel
- Add VS Code language model commit message generation from staged changes
- Add file sorting modes for path, name, status, and extension in the native Changes view menu
- Add native submodule toolbar context actions for pull, push, fetch, commit, changes, branch, remote, stash, and tags workflows
- Add a compact commit composer that shows the target branch and delegates advanced commit options to a native VS Code menu

### Fixed

#### Changes Panel
- Publish branches without an upstream through VS Code Git instead of failing with a plain push
- Keep advanced commit composer actions working for both the main repository and submodule scopes

## [0.5.0] - 2026-06-04

### Added

#### Look Graph
- Add operation feedback for graph Git commands with running, success, and failure states
- Show busy indicators on graph fetch, update selected branch, and refresh controls while operations are active
- Surface background remote operations as started instead of implying completion when work continues in a hidden terminal

## [0.4.0] - 2026-06-04

### Added

#### Commit History
- Add a repository scope selector when submodules are available, so toolbar actions, commit details, diffs, and commit commands can run against the selected submodule
- Add end-to-end coverage for commit history submodule scope workflows

### Changed

#### Look Graph
- Show full commit dates with hours, minutes, and seconds in the graph date column

## [0.3.0] - 2026-06-03

### Added

#### Look Graph
- Add reusable resizable panels for the branch panel, commit details panel, and commit message sub-panel
- Add file search to the commit details panel
- Increase the branch panel resize limit for long branch names

#### Webview
- Reuse a shared search input across branch search, commit details file search, commit history search, and graph text/hash search
- Add file icons for `Fastfile`, `.bin`, and `.properties` files

## [0.2.3] - 2026-06-03

### Fixed

#### Look Graph
- Make the branch panel resize handle keyboard accessible with ARIA sizing metadata and arrow-key resizing
- Restore document cursor and text-selection state when branch panel resizing is interrupted

## [0.2.2] - 2026-06-03

### Added

#### Webview
- Add `lookGit.fontSize` so Look Git can follow VS Code `editor.fontSize` by default or use an independent user-configured font size

### Fixed

#### Webview
- Apply font-size changes live to Changes, Commit History, and Look Graph webviews without requiring a reload
- Improve readability of branch tracking, current-branch, graph ref, and history ref badges

## [0.2.1] - 2026-06-03

### Fixed

#### Commit History
- Delegate fetch, pull, and push toolbar actions to VS Code Git so HTTPS remotes can use the normal credential and authentication flow instead of failing in headless CLI mode

## [0.2.0] - 2026-06-02

### Added

#### Changes Panel
- Open parent-repo submodule gitlink diffs, including dirty submodule pointers, in a read-only generated diff document
- Open stash file diffs from stash rows and keep row selection/expansion stable across refreshes
- Native VS Code context menus and toolbar commands for refresh, graph navigation, view/sort, commit, branch, remote, stash, tag, pull, push, and fetch workflows

#### Look Graph
- Repository toolbar actions for selecting branches, returning to the current item, fetching, pulling, pushing, refreshing, and switching tree/list views
- Branch panel actions for create, update selected, delete, compare with local, show current branch, fetch, expand all, and collapse all
- Branch context actions for worktree-aware branch comparisons, worktree opening/reveal, checkout, rebase, merge, push, rename, and delete
- Remote branch indicators, origin badges, and not-pushed commit counters

#### Packaging
- VSIX packaging script support for experimental display names and filenames

### Fixed

#### Changes Panel
- Preserve expanded submodules, stashes, staged, unstaged, and conflict sections after parent status refreshes
- Keep submodule staged, unstaged, stash, and conflict sections toggleable and omit empty submodule detail sections
- Avoid save prompts when closing generated submodule gitlink diff documents

#### Look Graph
- Refresh branch ahead/behind state after fetch operations
- Route generated diff views through read-only virtual documents instead of dirty temporary editors

## [0.1.1] - 2026-06-02

### Fixed

#### Changes Panel
- Preserve expanded submodules after parent status refreshes and reload stale submodule details without collapsing the UI
- Preserve expanded stash entries when the same stash still exists after refreshes, and reload missing stash file details automatically
- Ignore stale submodule and stash detail responses after the underlying item disappears or changes identity

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

#### Look Graph
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
