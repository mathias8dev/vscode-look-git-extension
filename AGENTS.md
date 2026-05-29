# AGENTS.md — Architecture & Development Rules

This file is the single source of truth for AI agents working on Look Git (experimental branch).
Read it entirely before writing any code.

---

## Project Goal

A VS Code extension providing a full git UI with:
- Git graph (branches, commits, merges, tags, worktree badges)
- Changes panel (staged, unstaged, conflicts, stash)
- Advanced worktree support (list, add, remove, switch, per-worktree context)
- Advanced submodule support (status, dirty detection, init, update, open, per-submodule context)

---

## Layer Architecture

```
src/
├── core/         Pure domain logic — no VS Code, no React, no git exec, no I/O
├── extension/    VS Code host — git processes, commands, view providers, lifecycle
├── protocol/     Typed message contracts, one slice per feature
└── webview/      React UI — one Zustand store per feature slice
```

### Strict dependency rule

```
webview   →  protocol  (read only)
extension →  core
extension →  protocol
core      →  nothing external
protocol  →  nothing
```

**Never:**
- `core` importing from `vscode`, `react`, or `extension`
- `webview` importing from `extension` or `core`
- `extension` importing React components
- `protocol` importing from any other layer
- Circular dependencies of any kind (enforce with eslint `import/no-cycle`)

---

## Protocol — Feature Slices

Each feature owns its message types. No global union.

```
src/protocol/
├── shared/
│   ├── base.ts          RequestId, ErrorMessage, Pagination types
│   └── repo.ts          RepoContext, RepoKind
├── graph/
│   ├── messages.ts      GraphRequest | GraphResponse | GraphPush
│   └── types.ts         GraphData, GraphRow, WorktreeInfo, …
├── changes/
│   ├── messages.ts      ChangesRequest | ChangesResponse | ChangesPush
│   └── types.ts         StatusData, StatusEntry, StashEntry, …
├── worktrees/
│   ├── messages.ts
│   └── types.ts         WorktreeInfo, WorktreeStatus
└── submodules/
    ├── messages.ts
    └── types.ts         SubmoduleInfo, SubmoduleStatus
```

### Message shape rules

Every message that expects a reply carries a `requestId`. Push messages (unsolicited updates) do not.

```typescript
// Request → Response pattern (correlated)
type GraphDataRequest = {
  readonly type: 'graph/dataRequest';
  readonly requestId: string;       // nanoid(), echoed in response
  readonly repoId: string;
  readonly filters: GraphFilters;
  readonly page: GraphPage;
};

type GraphDataResponse = {
  readonly type: 'graph/dataResponse';
  readonly requestId: string;       // matches the request
  readonly data: GraphData;
};

// Push message (repo changed externally — no requestId)
type GraphDataPush = {
  readonly type: 'graph/dataPush';
  readonly repoId: string;
  readonly data: GraphData;
};
```

Rules:
- All types are `readonly` and JSON-serialisable (`string`, `number`, `boolean`, plain arrays/objects)
- No `Date` — use ISO 8601 `string`
- No `Map`, `Set`, or class instances in protocol types
- Pagination is part of the protocol from day one — never send unbounded arrays

```typescript
type GraphPage = { readonly offset: number; readonly limit: number };
type GraphData = {
  readonly rows: readonly GraphRow[];
  readonly totalCount: number;      // total matching the filter (for pagination)
  readonly hasMore: boolean;
};
```

---

## `src/core/` — Domain Layer

Pure TypeScript. Zero external dependencies. Every function is testable with plain inputs.

```
src/core/
├── git/
│   ├── GitRepository.ts        Interface for all git operations (AbortSignal everywhere)
│   ├── RepoContext.ts          { id, cwd, kind, parentId? }
│   ├── RepoRegistry.ts         Lifecycle: create, destroy, enumerate RepoContexts
│   └── domain/
│       ├── GitCommit.ts        Domain types (commit, parents, refs)
│       ├── GitStatus.ts        Domain types (staged, unstaged, conflict entries)
│       ├── GitWorktree.ts      Domain types (WorktreeInfo, WorktreeStatus)
│       └── GitSubmodule.ts     Domain types (SubmoduleInfo, SubmoduleStatus)
├── parsing/
│   ├── parseStatus.ts          (output: string) => GitStatusEntry[]
│   ├── parseLog.ts             (output: string) => GitCommit[]
│   ├── parseWorktreeList.ts    (output: string) => WorktreeInfo[]
│   ├── parseSubmoduleStatus.ts (output: string) => SubmoduleInfo[]
│   └── parseGraph.ts           (commits: GitCommit[]) => GraphRow[]
└── usecases/
    ├── GetGraphData.ts         Uses GitRepository + AbortSignal
    ├── GetStatus.ts
    ├── GetWorktrees.ts
    └── GetSubmodules.ts
```

Rules:
- Parsing functions: `(rawString: string) => DomainType[]` — pure, synchronous, no I/O
- Use-cases receive `GitRepository` interface + `AbortSignal`, never a concrete class
- `RepoContext.id` is stable across extension restarts (derived from `cwd` path, not a random ID)
- `RepoRegistry` owns the lifecycle of all contexts — no code outside it creates or destroys contexts

### `GitRepository` interface (must use AbortSignal)

```typescript
interface GitRepository {
  readonly context: RepoContext;
  exec(args: string[], signal?: AbortSignal): Promise<string>;
  getStatus(signal?: AbortSignal): Promise<GitStatusEntry[]>;
  getLog(opts: LogOptions, signal?: AbortSignal): Promise<GitCommit[]>;
  listWorktrees(signal?: AbortSignal): Promise<WorktreeInfo[]>;
  addWorktree(path: string, branch: string, createNew?: boolean, signal?: AbortSignal): Promise<void>;
  removeWorktree(path: string, force?: boolean, signal?: AbortSignal): Promise<void>;
  getSubmoduleStatus(signal?: AbortSignal): Promise<SubmoduleInfo[]>;
  // … all operations accept AbortSignal
}
```

---

## `src/extension/` — Host Layer

```
src/extension/
├── activate.ts                 Entry point — wires everything, no logic
├── git/
│   ├── GitProcessRepository.ts  ONLY file that calls child_process.execFile
│   ├── GitLockRetry.ts          Exponential backoff on index.lock errors
│   └── RepoContextFactory.ts    Creates RepoContexts from vscode.git API
├── views/
│   ├── GraphViewProvider.ts     WebviewViewProvider — owns graph webview (includes worktrees + submodules sections)
│   └── ChangesViewProvider.ts   WebviewViewProvider — owns changes webview
├── messaging/
│   ├── GraphMessageRouter.ts    Routes graph webview ↔ extension messages (incl. worktree + submodule cmds)
│   └── ChangesMessageRouter.ts  Routes changes webview ↔ extension messages
├── commands/
│   ├── graphCommands.ts
│   ├── changesCommands.ts
│   ├── worktreeCommands.ts
│   └── submoduleCommands.ts
└── watchers/
    └── GitFileWatcher.ts        Watches .git/HEAD, .git/worktrees/*/HEAD, …
```

Rules:
- `activate.ts` only wires dependencies — no business logic
- Each `MessageRouter` handles exactly one webview's messages
- `GitProcessRepository` is the only file with `child_process` — one per `RepoContext`
- All pending git operations use `AbortController`; cancel on view disposal or new request

### Cancellation pattern

```typescript
class GraphMessageRouter {
  private pending = new Map<string, AbortController>();

  async handleDataRequest(req: GraphDataRequest): Promise<void> {
    // Cancel previous in-flight request for same repoId
    this.pending.get(req.repoId)?.abort();
    const controller = new AbortController();
    this.pending.set(req.repoId, controller);

    try {
      // AbortSignal flows to GitProcessRepository only — use-cases do not receive it
      const data = await this.usecase.execute(req.filters, req.page, controller.signal);
      this.webview.postMessage({ type: 'graph/dataResponse', requestId: req.requestId, data });
    } catch (err) {
      if ((err as Error).name === 'AbortError') { return; }
      this.webview.postMessage({ type: 'graph/error', requestId: req.requestId, message: String(err) });
    } finally {
      this.pending.delete(req.repoId);
    }
  }
}
```

---

## `src/webview/` — UI Layer

Multiple React apps (one per webview). No shared runtime state between them.

```
src/webview/
├── graph/
│   ├── main.tsx              Entry point for graph webview
│   ├── store.ts              Zustand store (graph state)
│   ├── GraphView.tsx
│   ├── BranchPane.tsx
│   ├── CommitTable.tsx
│   ├── CommitRow.tsx
│   ├── DetailsPane.tsx
│   └── WorktreeBadge.tsx
├── changes/
│   ├── main.tsx              Entry point for changes webview
│   ├── store.ts              Zustand store (changes state)
│   ├── ChangesView.tsx
│   ├── FileRow.tsx
│   ├── SubmoduleRow.tsx      Different actions: no diff, stage/unstage + Open
│   └── ConflictRow.tsx
└── shared/
    ├── platform.ts           acquireVsCodeApi() wrapper — call once, export
    ├── useRequest.ts         Hook: send request, await correlated response
    ├── icons.tsx             All SVG icons
    └── theme.css             VS Code CSS variables
```

### Zustand store pattern

```typescript
// src/webview/graph/store.ts
interface GraphStore {
  repoId: string | null;
  rows: GraphRow[];
  hasMore: boolean;
  filters: GraphFilters;
  selectedHash: string | null;
  setData(data: GraphData): void;
  setFilters(f: Partial<GraphFilters>): void;
  selectCommit(hash: string): void;
}

export const useGraphStore = create<GraphStore>((set) => ({
  repoId: null,
  rows: [],
  hasMore: false,
  filters: defaultFilters,
  selectedHash: null,
  setData: (data) => set({ rows: data.rows, hasMore: data.hasMore }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  selectCommit: (hash) => set({ selectedHash: hash }),
}));
```

### `useRequest` hook — correlated request/response

```typescript
// usage in a component
const { send, isPending } = useRequest<GraphDataResponse>('graph/dataResponse');

const loadPage = (page: GraphPage) =>
  send({ type: 'graph/dataRequest', requestId: nanoid(), repoId, filters, page });
```

Rules:
- Components call `useGraphStore(selector)` — never receive store slices as props from `App`
- Components never call `vscode.postMessage` directly — use `useRequest` or dedicated action hooks
- `platform.ts` calls `acquireVsCodeApi()` exactly once at module load — all other files import from it
- No module-level mutable variables — Zustand is the only allowed mutable state

---

## Multi-Repo Model (RepoContext)

Every git working directory is a `RepoContext`. No single-cwd assumption anywhere.

```typescript
interface RepoContext {
  readonly id: string;           // SHA-256 of normalized cwd path (stable)
  readonly cwd: string;          // absolute path
  readonly kind: 'main' | 'worktree' | 'submodule';
  readonly parentId?: string;    // for worktrees and submodules
  readonly label: string;        // short display name
}
```

Lifecycle (managed by `RepoRegistry`):
1. On activation: discover repos via `vscode.git` API
2. On `repo.onDidOpen`: create context for new repo
3. On linked worktree detected: create child context with `kind: 'worktree'`
4. On submodule detected: create child context with `kind: 'submodule'`
5. On `repo.onDidClose`: destroy context and cancel all pending operations

### Inter-webview coordination

Webviews cannot share React state (separate iframes). When the active repo changes, the extension pushes `repo/contextChanged` to **all open webviews**. Each webview resets its Zustand store and requests fresh data.

```typescript
// Extension side — pushed on active repo change
type RepoContextChangedPush = {
  readonly type: 'repo/contextChanged';
  readonly context: SerializedRepoContext;
};

// Webview side — handled in useRepoSync() hook in each app
useEffect(() => {
  if (msg?.type === 'repo/contextChanged') {
    store.reset();
    sendRequest({ type: 'graph/dataRequest', ... });
  }
}, [msg]);
```

### Worktrees and submodules — webview only

Worktrees and submodules are rendered **exclusively inside the graph webview** (branch pane and a submodules section). No `TreeDataProvider` is registered for them. The graph webview owns the full sidebar experience for these features.

---

## Worktree Rules

1. Each linked worktree is a `RepoContext` with `kind: 'worktree'` and `parentId` = main repo id.
2. `GitProcessRepository` is instantiated per context — `cwd` always comes from `context.cwd`.
3. File watchers must cover `**/.git/worktrees/*/HEAD` in addition to `**/.git/HEAD`.
4. **Switch worktree**: offer a Quick Pick — "Open in New Window" (default) or "Open in Current Window". Never silently replace the workspace.
5. **Add worktree wizard**: (1) input path, (2) select existing branch or type new branch name. Validate path does not already exist.
6. **Remove worktree**: always show a confirmation. Force-remove requires a second confirmation that explicitly warns about data loss.
7. The Worktrees TreeView shows: path, current branch (or `detached HEAD @abc1234`), dirty indicator.

---

## Submodule Rules

1. Each submodule is a `RepoContext` with `kind: 'submodule'` and `parentId` = parent repo id.
2. **Submodule status** is fetched from the parent repo via `git submodule status`.
3. **Dirty detection** per submodule: run `git -C <submodule-path> status --porcelain` — non-empty output = dirty.
4. **Out-of-sync detection**: compare registered commit (`git ls-files -s -- <path>` from parent) with HEAD (`git -C <path> rev-parse HEAD`). Mismatch = out of sync.
5. In the **Changes panel**, gitlink entries (`isSubmodule: true`) show:
   - Submodule icon instead of file icon
   - Stage / Unstage button (pointer change can be staged)
   - "Open Submodule" button (opens folder in VS Code)
   - No diff button — gitlinks cannot be diffed as files
   - Row click does not trigger diff
6. In **Commit History** file lists, mode-160000 entries show submodule icon and block diff navigation.
7. The **Submodules TreeView** shows per submodule:
   - Status badge: `clean` | `dirty` | `out-of-sync` | `not-initialized`
   - Registered commit in parent (short hash)
   - HEAD in submodule (short hash), if initialized
   - Context menu: Initialize, Update, Fetch, Open in VS Code
8. **"Update All"** runs `git submodule update --init --recursive` with confirmation.
9. **"Open Submodule"** opens the folder in VS Code (new or current window — user's choice via Quick Pick). Look Git then runs on it naturally.

---

## Testing Rules

| What | Framework | Location | Rule |
|---|---|---|---|
| Parsing functions | vitest | `tests/core/parsing/` | Pure input/output, no mocks |
| Use-cases | vitest | `tests/core/usecases/` | Mock `GitRepository` interface only |
| GitProcessRepository | vitest | `tests/extension/git/` | Real temp git repos via helpers |
| Message routers | vitest | `tests/extension/messaging/` | Mock webview + mock repo |
| React components | vitest + RTL | `tests/webview/` | jsdom, no vscode mock needed |
| Zustand stores | vitest | `tests/webview/stores/` | Import store, call actions, assert state |
| E2E | WebdriverIO | `tests/e2e/` | Real VS Code instance |

Rules:
- Every parsing function tests: empty output, null-byte separators, special path chars, unicode
- No `any` in test assertions — use `satisfies` or explicit cast with justification
- E2E: always `scrollIntoView` before clicking (content-visibility: auto hides off-screen rows)
- Windows CI: skip tests creating files with `>`, `?`, `\n` using `it.skipIf(process.platform === 'win32')`
- `AbortSignal` tests: verify that aborting an in-flight request does not post a response

---

## Code Style Rules

- **No comments** unless the WHY is non-obvious (a git quirk, a browser limitation, a workaround)
- **No `// TODO`** — create a GitHub issue instead
- **No barrel files** (`index.ts` re-exporting everything) — import the file directly
- **No `any`** — use `unknown` and narrow; `as Type` only with an inline justification comment
- **No magic strings** — all message `type` literals come from the protocol types
- **File names**: `kebab-case.ts` / `.tsx`, **Types**: `PascalCase`, **Functions/variables**: `camelCase`
- **One primary export per file** for domain types and use-cases; utility files may export multiple
- Font sizes in CSS: `em` or `inherit` only — never hardcoded `px`
- Colors: `var(--vscode-*)` only — never hardcoded hex or rgba
- SVG icons: `fill="currentColor"`, `24×24` for activity bar, `16×16` for inline/toolbar

---

## What NOT to Do

- **Do not** put git parsing logic in `extension/` — it belongs in `core/parsing/`
- **Do not** import `vscode` in `core/` or `webview/`
- **Do not** store mutable state in module-level variables in the webview — Zustand only
- **Do not** call `acquireVsCodeApi()` more than once — import from `shared/platform.ts`
- **Do not** call `innerHTML` with unsanitized data — always `escapeHtml()` or React JSX
- **Do not** hardcode `'origin'` as the remote name — resolve via `git remote`
- **Do not** assume a single repo — every operation takes a `RepoContext`
- **Do not** swallow errors — every `catch` either re-throws or sends an error message to the webview
- **Do not** add a git command without a test against a real temp repo in `tests/extension/git/`
- **Do not** send unbounded arrays over the protocol — always paginate
- **Do not** start a git operation without threading an `AbortSignal` through to `child_process`
- **Do not** call `postMessage` directly from a React component — use `useRequest` or an action hook
- **Do not** share React state between the graph webview and the changes webview — they are separate iframes

---

## Commit Message Format

```
<type>(<scope>): <short description>

Types : feat | fix | refactor | test | docs | build | chore
Scopes: core | extension | protocol | webview | graph | changes | worktrees | submodules | ci
```

Examples:
- `feat(submodules): add SubmoduleViewProvider with status and dirty detection`
- `fix(core): handle null bytes at end of parseWorktreeList output`
- `test(extension): real-repo tests for addWorktree and removeWorktree`
- `refactor(protocol): split messages into per-feature slices`
