# AGENTS.md — Architecture & Development Rules

This file is the single source of truth for AI agents working on Look Git (experimental branch).
Read it entirely before writing any code.

---

## Project Goal

A VS Code extension providing a full git UI with:
- Git graph (branches, commits, merges, tags)
- Changes panel (staged, unstaged, conflicts, stash)
- Advanced worktree support (list, add, remove, switch)
- Advanced submodule support (status, init, update, open, dirty detection)

---

## Layer Architecture

```
src/
├── core/         Pure domain logic — no VS Code, no React, no git exec
├── extension/    VS Code host — git operations, commands, view providers
├── protocol/     Typed message contracts (shared, imported by both sides)
└── webview/      React UI — no extension API, no git, no file system
```

### Strict dependency rules

```
webview  →  protocol  (read only)
extension →  core
extension →  protocol
core      →  nothing external
```

**Never:**
- `core` importing from `vscode`, `react`, or `extension`
- `webview` importing from `extension` or `core`
- `extension` importing React components
- `protocol` importing from any other layer

---

## Layer Contracts

### `src/core/`

Pure TypeScript business logic. Must be testable with zero mocks.

```
src/core/
├── git/
│   ├── GitRepository.ts       Interface: all git read/write operations
│   ├── GitStatus.ts           Domain types: staged, unstaged, conflict entries
│   ├── GitCommit.ts           Domain types: commit, parents, refs
│   ├── GitWorktree.ts         Domain types: WorktreeInfo, WorktreeStatus
│   ├── GitSubmodule.ts        Domain types: SubmoduleInfo, SubmoduleStatus
│   └── GitGraph.ts            Domain types: GraphRow, LaneData
├── parsing/
│   ├── parseStatus.ts         Parse porcelain v1 -z output
│   ├── parseLog.ts            Parse git log output
│   ├── parseWorktreeList.ts   Parse git worktree list --porcelain
│   └── parseSubmoduleStatus.ts
└── usecases/
    ├── GetGraphData.ts
    ├── GetStatus.ts
    ├── GetWorktrees.ts
    └── GetSubmodules.ts
```

Rules:
- All parsing functions are pure: `(string) => DomainType[]`
- Use-cases receive a `GitRepository` interface, never a concrete implementation
- No `async/await` in parsing — only in use-cases that call the repository

### `src/extension/`

VS Code host layer. Depends on `vscode` API and spawns git processes.

```
src/extension/
├── activate.ts                Extension entry point
├── git/
│   ├── GitProcessRepository.ts  Concrete GitRepository (spawns git)
│   ├── GitLockRetry.ts          Retry logic for index.lock
│   └── GitWorkingDirectory.ts   Resolves cwd per repo/worktree
├── views/
│   ├── ChangesViewProvider.ts   WebviewViewProvider for Changes
│   ├── GraphViewProvider.ts     WebviewViewProvider for Git Graph
│   ├── WorktreeViewProvider.ts  TreeDataProvider for Worktrees
│   └── SubmoduleViewProvider.ts TreeDataProvider for Submodules
├── commands/
│   └── *.ts                     One file per command group
└── messaging/
    ├── ExtensionMessageRouter.ts  Routes webview → extension messages
    └── WebviewMessageSender.ts    Sends extension → webview messages
```

Rules:
- `GitProcessRepository` is the ONLY file that calls `child_process.execFile`
- Each view provider owns one webview or tree — no shared mutable state
- Message routing is explicit: every message type has exactly one handler

### `src/protocol/`

Discriminated union types. Imported by both `extension` and `webview`.

```
src/protocol/
├── messages.ts          All ExtensionToWebviewMessage and WebviewToExtensionMessage unions
├── graph.ts             Serialisable graph data types (GraphData, GraphRow, WorktreeInfo …)
├── changes.ts           Serialisable status types (StatusData, StatusEntry …)
├── worktrees.ts         Serialisable worktree types
└── submodules.ts        Serialisable submodule types
```

Rules:
- All types must be `readonly` and JSON-serialisable (no `Date`, no `Map`, no class instances)
- Use `string` for dates (ISO 8601), `string[]` for arrays of hashes
- Every message union is prefixed: `ExtensionToWebviewMessage` | `WebviewToExtensionMessage`
- Tag every message with a literal `type` string — no generic objects

### `src/webview/`

React UI. Receives protocol messages, posts protocol messages. No business logic.

```
src/webview/
├── main.tsx               Entry point, mounts App
├── platform/
│   └── vscodeHost.ts      Thin wrapper around acquireVsCodeApi()
├── App.tsx                Root component, owns top-level state
├── graph/
│   ├── GraphView.tsx
│   ├── BranchPane.tsx
│   ├── CommitRow.tsx
│   └── WorktreeBadge.tsx
├── changes/
│   ├── ChangesView.tsx
│   ├── FileRow.tsx
│   ├── ConflictRow.tsx
│   └── SubmoduleRow.tsx
├── worktrees/
│   └── WorktreeSection.tsx   (inside BranchPane)
├── submodules/
│   └── SubmoduleSection.tsx  (inside BranchPane or separate panel)
└── shared/
    ├── icons.tsx
    ├── useVsCodeMessage.ts   Custom hook: receives messages from extension
    └── theme.css
```

Rules:
- Components are pure functions — no side effects outside of hooks
- State lives in the closest common ancestor, never in a module-level variable
- `useVsCodeMessage` is the single entry point for extension → webview communication
- All extension calls go through `vscodeHost.postMessage(msg)` — never call `vscode` directly from components

---

## Multi-Repo Model (Worktrees & Submodules)

This is the core architectural decision that separates this implementation from the old one.

**Every git working directory is a `RepoContext`:**

```typescript
// src/core/git/RepoContext.ts
interface RepoContext {
  readonly id: string;          // stable identifier (cwd hash or path hash)
  readonly cwd: string;         // absolute path
  readonly kind: 'main' | 'worktree' | 'submodule';
  readonly parentId?: string;   // set for worktrees and submodules
}
```

Rules:
- `GitProcessRepository` is instantiated per `RepoContext`, not globally
- The extension tracks all active `RepoContext`s in a `RepoRegistry`
- When a worktree is opened as a VS Code workspace folder, it gets its own context automatically
- Submodules within a repo each get a context — status queries run in their own `cwd`
- The Changes panel and Git Graph can target any `RepoContext`

---

## Protocol Message Conventions

```typescript
// Good — explicit, typed, no ambiguity
type ExtensionToWebviewMessage =
  | { type: 'graphData';     data: GraphData }
  | { type: 'statusData';    data: StatusData }
  | { type: 'worktreeList';  worktrees: WorktreeInfo[] }
  | { type: 'submoduleList'; submodules: SubmoduleInfo[] }
  | { type: 'error';         message: string; context?: string }

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'stageFile';          filePath: string }
  | { type: 'openSubmodule';      path: string }
  | { type: 'executeWorktreeCmd'; command: WorktreeCommand; path?: string }
  | { type: 'requestGraphData';   filters: GraphFilters }
```

Rules:
- One `type` literal per message — no `action` or `payload` wrappers
- All message data is flat when possible — avoid deeply nested objects
- Responses always mirror the request `type` with a `Result` suffix or are separate push events

---

## Git Operations — What Goes Where

| Operation | Layer | File |
|---|---|---|
| `git status --porcelain=v1 -z` | extension | `GitProcessRepository` |
| Parse porcelain output | core | `parsing/parseStatus.ts` |
| Mark submodule entries | core | `parsing/parseStatus.ts` |
| Stage file | extension | `GitProcessRepository.stageFile()` |
| List worktrees | extension | `GitProcessRepository.listWorktrees()` |
| Parse worktree list | core | `parsing/parseWorktreeList.ts` |
| Get submodule status | extension | `GitProcessRepository.getSubmoduleStatus()` |
| Mode-160000 detection | extension | `GitProcessRepository.getCommitFileRaws()` |
| Build graph lanes | core | `git/GraphLaneAssigner.ts` |

---

## Worktree Support Rules

1. **Every linked worktree is a first-class `RepoContext`** — the extension creates one automatically when a worktree path is detected.
2. **No hardcoded single-cwd assumption** — every git call passes `cwd` from the active `RepoContext`.
3. **File watcher** must cover both `**/.git/HEAD` and `**/.git/worktrees/*/HEAD`.
4. **The Worktrees panel** (TreeDataProvider) shows all worktrees detected via `git worktree list --porcelain` from the main repo.
5. **Switch worktree** = `vscode.openFolder(uri, { forceNewWindow: true })` — do not reuse the current window.
6. **Add worktree wizard** = two-step input: path then branch name (new or existing). Always confirm before `removeWorktree --force`.

---

## Submodule Support Rules

1. **Every submodule is a `RepoContext`** with `kind: 'submodule'` and `parentId` pointing to its parent.
2. **Submodule detection** uses `git submodule status` output parsed in `core/parsing/parseSubmoduleStatus.ts`.
3. **In the Changes panel**, submodule entries (`isSubmodule: true`) show a submodule icon, a stage/unstage button, and an "Open Submodule" button. No diff button — gitlinks cannot be diffed as files.
4. **In commit details**, mode-160000 files show a submodule icon and block diff navigation.
5. **The Submodules panel** (TreeDataProvider) lists each submodule with:
   - Status: `clean`, `dirty`, `out-of-sync`, `not-initialized`
   - Registered commit in parent (from `git ls-files -s -- <path>`)
   - HEAD commit in submodule (from `git -C <path> rev-parse --short HEAD`)
   - Actions: Initialize, Update, Fetch, Open in VS Code
6. **"Update All"** runs `git submodule update --init --recursive` from the parent cwd.
7. **Clicking "Open"** opens the submodule folder in VS Code — Look Git then runs on it naturally as a new `RepoContext`.

---

## Testing Rules

| What | Framework | Location | Rule |
|---|---|---|---|
| Parsing functions | vitest | `tests/core/parsing/` | No mocks, pure input→output |
| Use-cases | vitest | `tests/core/usecases/` | Mock `GitRepository` interface only |
| GitProcessRepository | vitest | `tests/extension/git/` | Real temp git repos via `gitRepo.ts` helpers |
| View providers | vitest | `tests/extension/views/` | Mock webview + real GitRepository |
| React components | vitest + @testing-library/react | `tests/webview/` | jsdom, no vscode mock needed |
| E2E | WebdriverIO + wdio-vscode-service | `tests/e2e/` | Real VS Code instance |

Rules:
- Every parsing function has at least one test per edge case (empty output, null bytes, special chars)
- No `any` in test assertions
- E2E tests scroll elements into view before clicking (content-visibility: auto)
- Windows CI: skip tests that create files with `>`, `?`, or `\n` in names

---

## Code Style Rules

- **No comments** unless the WHY is non-obvious (a workaround, a git quirk, a browser limitation)
- **No `// TODO`** — create a GitHub issue instead
- **No barrel files** (`index.ts` that re-exports everything) — import directly
- **No `any`** — use `unknown` and narrow explicitly
- **No magic strings** — all git command args are typed arrays, all message types are literals
- **File names**: `kebab-case.ts`, **Types**: `PascalCase`, **Functions**: `camelCase`
- **One exported symbol per file** for domain types and use-cases (multiple exports OK in utility files)
- Font sizes in CSS: always `em` or `inherit`, never hardcoded `px`
- Colors: always `var(--vscode-*)`, never hardcoded hex
- SVG icons: `fill="currentColor"`, `16×16` for commands, `24×24` for activity bar

---

## What NOT to Do

- **Do not** put git parsing logic in `extension/` — it belongs in `core/parsing/`
- **Do not** import `vscode` in `core/` or `webview/`
- **Do not** store mutable state in module-level variables in the webview (React state only)
- **Do not** call `acquireVsCodeApi()` more than once (the API is a singleton)
- **Do not** use `innerHTML` with unsanitized user data — always `escapeHtml()` first
- **Do not** hardcode `origin` as the remote name — resolve from `git remote`
- **Do not** assume a single repo — every operation takes a `RepoContext`
- **Do not** swallow errors silently — all catch blocks either re-throw or post an `error` message to the webview
- **Do not** add a new git command without a corresponding test against a real temp repo

---

## React Component Rules

- Components receive typed props from protocol types — no direct `postMessage` calls inside a component
- All `postMessage` calls live in event handlers, never in render or effects without cleanup
- Use `useReducer` for complex local state (file tree, filter state), `useState` for simple flags
- Never put git data (commits, status) in React state directly — keep it in the `App` root and pass down via props or context
- CSS is scoped to each component via a class prefix matching the component name (e.g., `.file-row-*`)

---

## Commit Message Format

```
<type>(<scope>): <short description>

Types: feat | fix | refactor | test | docs | build | chore
Scopes: core | extension | protocol | webview | graph | changes | worktrees | submodules | ci
```

Examples:
- `feat(submodules): add SubmoduleViewProvider with status display`
- `fix(core): handle null bytes in parseWorktreeList`
- `test(extension): add real-repo tests for listWorktrees`
