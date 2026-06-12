# Look Git

A modern, React-based Git extension for Visual Studio Code — featuring a visual commit graph, an enhanced changes panel with stash management, and an interactive commit history view.

![Look Git — commit graph, changes panel, and commit history in action](https://raw.githubusercontent.com/mathias8dev/vscode-look-git-extension/main/docs/look-git/lookgit.gif)

## Features

### Changes Panel

- **Staged & unstaged file list** with file-type icons, status letters, and hover actions
- **Inline stash creation** — click the archive icon in the Changes section header to stash without leaving the panel
- **Stash management** — apply, pop, or drop stashes directly; expand any stash to browse its files and open diffs
- **Submodule awareness** — submodule entries shown with dedicated icons and status badges; unsafe actions (discard, diff) blocked automatically
- **Conflict resolution** — dedicated section with merge editor, Accept Ours / Accept Theirs actions per file
- **Tree & list view** — toggle between hierarchical folder tree and flat file list
- **Keyboard navigation** — ↑↓ to move between files, Enter to open diff

### Commit History

- **Multi-expand commits** — open several commits simultaneously; each expands in-place showing its message, author, relative date, and changed files
- **Inline diff** — click any changed file to open a VS Code diff editor for that commit
- **File tree mode** — changed files shown as a navigable folder tree
- **Search** — filter the commit list in real time by message, author, hash, or date
- **Load more** — incremental pagination, 50 commits at a time

### Look Graph

- **SVG commit graph** — colored lanes with Bezier curves for merges and forks, primary branch always on lane 0
- **Branch panel** — collapsible Local / Remote / Worktrees tree on the left
- **WIP rows** — each worktree with uncommitted changes shows a dashed-circle row above its HEAD commit with staged/unstaged/conflict counts
- **Commit details panel** — click any commit to see its full message, author, and changed files in a side panel
- **Branch actions** — checkout, push, rename, delete, rebase, merge from the branch panel
- **Worktree support** — add, remove, and open linked worktrees; WIP status fetched per worktree
- **Filters** — search by text/hash, filter by branch, author, or path

## Screenshots

### Overview

![Look Git overview — Changes panel and Commit History in the sidebar, with the Look Graph open in the panel area](https://raw.githubusercontent.com/mathias8dev/vscode-look-git-extension/main/docs/look-git/linux.png)

The Changes panel and Commit History live in the sidebar, while the Look Graph opens in the panel area — here showing a commit's context menu with the full set of commit actions.

### Submodules, worktrees & conflicts

![Look Git submodule support — first-class submodule and worktree entries alongside the modern conflicts editor](https://raw.githubusercontent.com/mathias8dev/vscode-look-git-extension/main/docs/look-git/submodules.png)

First-class submodule and worktree support, plus the modern conflicts editor for resolving merges in place.

## Getting Started

1. Open a folder or workspace containing a Git repository in VS Code
2. Click the **Look Git** icon in the Activity Bar to access the Changes and Commit History panels
3. Open the **Look Graph** panel from the bottom panel area

## Requirements

- Visual Studio Code 1.85 or later
- A Git repository opened in VS Code

## Known Limitations

- The Look Graph view loads up to 300 commits per page by default
- CI/CD pipeline status indicators are not shown on graph rows

## License

Look Git is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) for noncommercial use.

Commercial use requires a separate paid commercial license from mathias8dev.
For commercial licensing, contact: mathias8dev@outlook.com.
