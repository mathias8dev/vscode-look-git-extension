# Look Git

Look Git is a VS Code extension for inspecting repository history and running advanced Git operations from dedicated activity bar and panel views.

## Features

- Git Changes view with staged and unstaged file groups.
- Commit History view with list and tree modes.
- Git Graph panel with branch lanes, branch filters, author filters, date filters, path filters, and commit details.
- Commit operations from history: cherry-pick, revert, drop, squash, fixup, rebase, reset, checkout, rename commit, and push up to a selected commit.
- Repository actions from the Changes view: fetch all, pull, push, stage all, unstage all, and discard all.
- Changed-file details with list and tree views.

## Requirements

- VS Code 1.85.0 or newer.

## Installation

Install the packaged extension from a generated `.vsix` file:

```sh
code --install-extension look-git-x.y.z.vsix
```

For local development, install dependencies and build the extension:

```sh
npm ci
npm run compile
```

Then launch the extension host from VS Code using the workspace debug configuration.

## Development

Common commands:

```sh
npm run compile
npm run lint
npm run test
npm run test:integration
npm run test:e2e
npm run vsix
```

`npm run package` performs a production build into `dist/`. `npm run vsix` packages the extension for installation or release.

## Release

The release workflow reads the version from `package.json` and uses it as the release tag, for example `v0.0.2`.

To publish a release:

1. Update the version in `package.json` and `package-lock.json`.
2. Add the release notes to `CHANGELOG.md`.
3. Merge or push the change to `main`.

After the `CI` workflow succeeds on `main`, GitHub Actions will package the extension, create the missing `vX.Y.Z` tag, and create a GitHub release with generated release notes and the `.vsix` asset attached. If a release already exists for that version, the workflow exits successfully without creating a duplicate.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
