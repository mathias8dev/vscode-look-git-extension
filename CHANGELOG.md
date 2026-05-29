# Changelog

All notable changes to Look Git are documented in this file.

## [1.1.2] - 2026-05-29

### Added

- Added a multi-select branch filter choicebox in Git Graph with an `All` option.

### Changed

- Made Git Graph filter chips toggle their dropdowns open and closed.
- Debounced Branch and User filter refreshes so multi-select interactions stay responsive.

## [1.1.1] - 2026-05-29

### Changed

- Replaced generated text-based file icons with real `vscode-icons` SVG icons in Changes and Git Graph webviews.
- Reused the same packaged file and folder SVG icons in Commit History while keeping the native VS Code TreeView behavior.
- Added third-party notices for bundled icon assets.

## [1.1.0] - 2026-05-29

### Added

- **New commit actions**: Create Patch, Undo Commit, Squash Into Parent, Interactive Rebase from Here, New Branch from Commit, New Tag from Commit, View Commit in Browser, Copy Commit Hash, Compare with Local, Show Repository at Revision.
- **Behind indicator**: branches in the Git Graph branch pane now show a badge with a descending arrow and count when behind their upstream.
- **Marketplace icon**: added a 128×128 PNG icon using the VS Code `git-branch` codicon with a `+` badge, referenced in `package.json` for the VS Code Marketplace.

### Fixed

- **Graph line jumps**: connected merge/fork lines that previously had a visual gap between rows (missing segment from the top of the row to the commit dot) by introducing `fromTop` in `LineDef`.
- **E2E reliability**: `clickFirstGraphCommit` now scrolls the target row into view before clicking, fixing failures caused by `content-visibility: auto` hiding off-screen rows from WebDriver.
- **Windows CRLF**: normalise line endings when asserting file content in merge-conflict E2E tests so they pass on Windows with `core.autocrlf=true`.

### Changed

- All webview font sizes now use relative units (`em`, `inherit`) instead of hardcoded `px` values, so the UI scales with the user's VS Code font-size setting.
- Folder and file icons across all three panels (Changes, Git Graph branch pane, Git Graph commit details) harmonised to the same Octicons fill-path with `currentColor` and `--vscode-symbolIcon-*` colour variables.
- Activity bar icon updated to the VS Code `git-branch` codicon (24×24, monochrome `currentColor`) with a `+` badge in the bottom-left corner.
- `.section-count` badge uses relative dimensions so it does not clip text at accessibility font sizes.
- `split-dropdown` separator uses `var(--vscode-button-border, transparent)` to match all themes.

## [1.0.2] - 2026-05-28

### Added

- Git Changes webview with staged and unstaged files.
- Git Graph panel with branch lanes, filters, commit details, and changed-file views.
- Commit History controls for advanced Git operations.
- Release automation for packaging the extension and creating GitHub releases.

### Changed

- Defaulted Commit History, Git Graph, and Changes file views to tree mode while keeping list mode available.
- Promoted the Commit History tree/list toggle into the visible view title actions.
- Improved webview styling to better follow injected VS Code theme and font variables.
- Packaged extension output now excludes development and test artifacts.
- Extension icons are centralized for reuse across VS Code and webview surfaces.

## [1.0.0] - 2026-02-11

### Added

- Initial Look Git extension scaffolding.
- Commit history view and core Git command integrations.
