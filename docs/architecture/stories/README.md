# Architecture User Stories

These stories describe target behavior for the current Look Git webviews and shared infrastructure. Each story includes an implementation sequence that respects the target architecture:

- Webviews send protocol messages with `RepositoryLocator` / `WorktreeLocator`.
- Routers resolve locators through `RepositoryRegistry` and call use cases.
- Use cases orchestrate repository/worktree operations.
- Runtime `GitRepository` / `Worktree` objects expose semantic operation capabilities they actually support.
- `HybridGitRuntime` selects CLI, VS Code, or a future Look-native runtime per semantic operation.

## Story Groups

- [Overview](overview.md)
- [Changes](changes/README.md)
- [Commit History](commit-history/README.md)
- [Look Graph](look-graph/README.md)
- [Shared Runtime and Context](shared/README.md)
