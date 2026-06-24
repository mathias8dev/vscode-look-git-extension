# Multi-Module Repository UX

Look Git treats each discovered Git checkout as a repository context. A workspace folder can therefore be either:

- a Git repository itself;
- a parent folder containing several independent Git repositories;
- a mix of workspace folders that resolve to the same or different repositories.

## UX Decision

When only one repository context is available, each webview opens directly on its normal content.

When more than one repository context is available, `Changes`, `Commit History`, and `Look Graph` first show a repository overview. The overview is the navigation root for the webview. Selecting a repository navigates into that repository and reveals the normal feature content. A back button returns to the overview.

This avoids hiding important module state in a toolbar picker. The user can compare modules before choosing one.

## Repository Overview

Each repository row should show:

- repository label and path;
- current branch;
- upstream or remote availability;
- staged, unstaged, and conflict counts;
- branch count;
- linked worktree count;
- submodule count;
- actions to navigate into the repository or open it in a new VS Code window.

The existing feature search input should filter repository rows while the overview is visible.

## Navigation Rules

- Repository selection is owned by the extension host, not by individual webview React state.
- A repository navigation event is pushed to every open webview.
- Webviews reset feature-local data after repository navigation and request fresh data for the selected repository.
- The selected repository is implicit after navigation and must not appear as an item in its own child list.
- Worktrees and submodules remain first-class sections inside the selected repository views. The top-level overview lists discovered repository contexts, not every worktree/submodule nested inside an already selected repository.

## Loading and Error States

Repository lists and active repository context are represented as protocol resources:

- `loading`: scan or summary calculation is in progress;
- `ready`: repository summaries are available;
- `error`: discovery or summary calculation failed.

The overview renders those states directly instead of showing a transient `Repository not found` state during navigation.

## Implementation Path

1. Discover repository contexts from workspace folders and bounded child scans.
2. Build `RepositorySummary` data for each context.
3. Push repository resources and active context resources to all repository-aware webviews.
4. Add a shared `RepositoryNavigator` component.
5. Wire navigation commands to the extension-owned repository selection store.
6. Add component stories and user-story tests for single repository, multi repository, loading, error, search, navigate, and back.
