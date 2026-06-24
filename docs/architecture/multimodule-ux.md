# Multi-Module Repository UX

Look Git treats each discovered Git checkout as a repository context. A workspace folder can therefore be either:

- a Git repository itself;
- a parent folder containing several independent Git repositories;
- a Git repository that contains independent nested repository modules;
- a mix of workspace folders that resolve to the same or different repositories.

## UX Decision

When only one repository context is available, each webview opens directly on its normal content.

When more than one repository context is available, `Changes`, `Commit History`, and `Look Graph` first show a repository overview. The overview is the navigation root for the webview. Selecting a repository opens the normal feature content for that repository. A back button returns to the overview.

This avoids hiding important module state in a toolbar picker. The user can compare modules before choosing one.

The overview behaves like a small nav host:

- if the workspace itself is a repository and it owns nested repository modules, the parent repository is implicit and the first screen lists its modules;
- if several top-level repositories are available, the first screen lists those top-level repositories;
- a repository row with child modules exposes a browse action that descends into its child list without selecting the parent content;
- a repository row click opens that repository content;
- a local back action returns from a child list to the parent list;
- the selected repository content has the global repository back action that returns all webviews to the repository overview.

## Repository Overview

Each repository row should show:

- repository label and path;
- current branch;
- upstream or remote availability;
- staged, unstaged, and conflict counts;
- branch count;
- linked worktree count;
- submodule count;
- repository module child count, when a row owns nested independent repositories;
- actions to navigate into the repository or open it in a new VS Code window.

The existing feature search input should filter repository rows while the overview is visible.

## Navigation Rules

- Repository selection is owned by the extension host, not by individual webview React state.
- A repository navigation event is pushed to every open webview.
- Webviews reset feature-local data after repository navigation and request fresh data for the selected repository.
- The selected repository is implicit after navigation and must not appear as an item in its own child list.
- The parent repository is implicit while browsing its child module list and must not appear as an item in that list.
- Browsing a child module list is local UI state; selecting a repository remains extension-owned shared state.
- Worktrees and submodules remain first-class sections inside the selected repository views. The top-level overview lists discovered repository contexts, not every worktree/submodule nested inside an already selected repository.
- Registered Git submodules from `.gitmodules` are not listed as repository modules in the overview; they remain inside the selected repository's submodule UI.

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
6. Add component stories and user-story tests for single repository, multi repository, nested repository modules, loading, error, search, navigate, browse child modules, and back.

## Verification

- Unit tests cover workspace repository discovery, nested repository module parent ids, and exclusion of registered submodules from module discovery.
- Component tests cover single repository, multi repository, implicit parent module lists, child browsing, parent-list back navigation, search, loading, and error states.
- Storybook includes a navigable repository hierarchy.
- WDIO has a multimodule scenario for a Git workspace parent with nested modules, including `app -> plugin` browsing and cross-webview repository sync.
- WDIO can use `LOOK_GIT_WDIO_CHROMEDRIVER_PATH` when the local environment cannot download the matching Chromium driver automatically.
