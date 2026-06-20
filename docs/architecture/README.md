# Look Git Whole-System Target Architecture

These diagrams describe a clean target architecture for the whole Look Git extension. They are not a record of the current implementation in every detail; they are a north star for refactoring without breaking the layer rules in `AGENTS.md`.

## Diagrams

- [target-layers-class.mermaid](target-layers-class.mermaid): layer ownership and dependency direction.
- [system-runtime-class.mermaid](system-runtime-class.mermaid): extension runtime composition.
- [git-topology-class.mermaid](git-topology-class.mermaid): repositories, submodules, worktrees, and semantic git execution.
- [git-operation-capabilities-class.mermaid](git-operation-capabilities-class.mermaid): class diagram of repository and worktree operation capabilities.
- [git-semantic-operations.md](git-semantic-operations.md): target semantic operation catalog.
- [pagination-cursors.md](pagination-cursors.md): cursor shape and stability rules for large git datasets.
- [operation-guards.md](operation-guards.md): optional guard policies attached to semantic actions.
- [feature-slices-class.mermaid](feature-slices-class.mermaid): graph, changes, history, worktrees, and submodules as feature slices.
- [message-contracts-class.mermaid](message-contracts-class.mermaid): representative typed request/response/push message families; concrete protocol remains feature-sliced.
- [stories/README.md](stories/README.md): classified user stories grouped by feature, with implementation sequences.

## Architectural Direction

The cleanest model separates three concepts that are currently easy to blur:

- `GitRepository`: any real git repository. Main repositories and submodule repositories are both git repositories.
- `Worktree`: a checkout of a git repository. Any repository can have a main worktree and linked worktrees, including submodule repositories.
- `GitCommit`: the domain representation of a commit.
- `PageRequest` / `Page<T>`: cursor-capable pagination values for bounded lists such as commits, graph rows, branches, worktrees, and submodules. Cursor invariants are defined in `pagination-cursors.md`.
- Git operation capabilities: smaller semantic interfaces grouped by repository operations and worktree operations. The full target surface is cataloged in `git-semantic-operations.md`.
- `GitRuntime`: the execution strategy behind semantic git operations.
- `CliGitRuntime`: implements semantic operations through the local git CLI and its configured credential helpers.
- `VscodeGitRuntime`: executes supported remote operations through the VS Code Git runtime and its credential/session context.
- `HybridGitRuntime`: chooses the runtime per semantic operation and context.
- `RepositoryLocator`: a protocol-safe JSON value used to resolve a runtime `GitRepository`.
- `WorktreeLocator`: a protocol-safe JSON value used to resolve a runtime `Worktree`.

Submodules should not be modeled as a special non-repository type. A submodule is a repository related to a parent repository by a `SubmoduleLink`. Worktrees should not be modeled as repositories. They belong to repositories.

Protocol locators are plain JSON values, not runtime classes. The extension layer resolves them into executable `GitRepository` / `Worktree` objects before use cases run. Those objects expose only the operation capabilities they support and delegate execution to `GitRuntime`. The webview only renders protocol facts and sends typed protocol messages. Core remains pure parsing/domain logic.

Credential management belongs to runtime implementations, not repositories. CLI execution can use the user's shell, SSH agent, and git credential helpers. VS Code execution can use the VS Code Git extension's authenticated runtime. The hybrid runtime centralizes the policy for choosing one or the other.

Not every semantic git operation is valid for every bound context. For example, a repository object can list worktrees, while a worktree object can commit or stash. Unsupported operations should fail explicitly with an unsupported-operation error rather than silently no-oping or leaking raw git args into use cases.

Routers handle protocol translation, cancellation, and error responses. Use cases own orchestration across resolved repositories, worktrees, pagination, and aggregation.

Use cases also enforce operation guards. UI acknowledgement is not sufficient by itself; guarded actions follow the policy in `operation-guards.md`.
