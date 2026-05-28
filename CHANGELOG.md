# Changelog

All notable changes to Look Git are documented in this file.

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
