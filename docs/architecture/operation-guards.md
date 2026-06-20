# Operation Guards

Semantic git actions stay clean: they describe what git can do. Guards describe what Look Git requires before a use case is allowed to call an action.

Examples:

- `getCommitGraph` has no guard.
- `push` may require credentials.
- `rebase` may require a clean worktree and no operation in progress.
- `resetHard` requires preview and confirmation.
- `cleanIgnored` requires preview and stronger confirmation.
- `openSubmoduleRepository` requires an initialized submodule.

## Boundary

The boundary is:

- Git capabilities expose semantic actions.
- Use cases evaluate guards before calling semantic actions.
- Extension host coordinates acknowledgement and validation.
- Webviews render guard prompts and send user acknowledgement.
- Runtimes execute git and do not know about guards.

The webview never creates trust. It only returns user intent. The host/application validates acknowledgement against the operation plan before the use case proceeds.

Sequence: [guarded-operation-acknowledgement.mermaid](stories/shared/guarded-operation-acknowledgement.mermaid)

## Concepts

### SemanticActionPolicy

`SemanticActionPolicy` declares the guards attached to a semantic action.

Fields:

- `action`: semantic action name.
- `guards`: guard list.

### OperationGuard

`OperationGuard` is a requirement that must be satisfied before execution.

Guard kinds:

- `confirm`: user acknowledgement is required.
- `previewRequired`: use case must produce a preview before acknowledgement.
- `cleanWorktreeRequired`: operation may not start with local changes.
- `noOperationInProgress`: merge, rebase, cherry-pick, or revert state must not already be active.
- `requiresCredentials`: runtime must be able to authenticate.
- `requiresInitializedSubmodule`: submodule repository must exist locally.
- `destructive`: operation can lose local work, remove files, rewrite history, or drop recovery handles.
- `highRiskRemote`: operation can update remote refs in a risky way.

### OperationPlan

`OperationPlan` is produced by a use case before guarded execution.

Fields:

- `id`: host-generated plan id.
- `action`: semantic action name.
- `repositoryId`: target repository.
- `worktreeId`: target worktree when checkout-scoped.
- `guards`: guards that must be acknowledged or satisfied.
- `targets`: typed `OperationTarget` values for refs, paths, commits, stashes, worktrees, submodules, or remotes affected.
- `preview`: typed `OperationPreview` when available.
- `recovery`: typed `RecoveryHint` when available.

### GuardAcknowledgement

`GuardAcknowledgement` is a protocol value returned after the user acknowledges the operation plan.

Fields:

- `planId`: acknowledged operation plan.
- `acknowledgedGuards`: guard kinds acknowledged by the user.

The extension stores plans in `OperationPlanRegistry`. `GuardAcknowledgementValidator` validates acknowledgements against plan id, guard list, operation context, targets, preview hash, and expiry. Use cases receive only validated acknowledgement state.

## Destructive Policies

Destructive actions must include at least:

- `previewRequired`, when git can provide a useful preview;
- `confirm`;
- `destructive`.

Examples:

- `discard`: `previewRequired`, `confirm`, `destructive`.
- `resetHard`: `previewRequired`, `confirm`, `destructive`.
- `cleanIgnored`: `previewRequired`, `confirm`, `destructive`.
- `dropCommit`: `previewRequired`, `confirm`, `destructive`.
- `removeWorktree`: `previewRequired`, `confirm`, `destructive`.
- `deinitSubmodule`: `previewRequired`, `confirm`, `destructive`.
- `forcePushWithLease`: `previewRequired`, `confirm`, `highRiskRemote`.

Some actions require stronger confirmation in the UI:

- forced worktree removal;
- clean ignored files;
- clean untracked directories;
- deinitialize dirty submodule;
- force push with lease;
- clear all stashes;
- reset hard with local changes.

The stronger confirmation is represented as a stricter `confirm` guard, not as a different git operation signature.

## Preview Requirements

Preview is required when practical:

- clean operations preview the files that would be removed;
- worktree removal previews path, branch, dirty state, and whether force is requested;
- submodule deinit previews path and dirty status;
- branch deletion previews merged/unmerged status and upstream state;
- force push previews ahead/behind and remote ref expected by lease;
- reset hard previews changed paths and target ref;
- discard previews affected paths or hunks.

If preview is impossible or incomplete, the operation plan must state that explicitly.

## Recovery Rules

Use cases record recovery information before executing guarded destructive actions when available:

- current `HEAD`;
- relevant reflog selector;
- affected branch/ref;
- stash identifier;
- worktree path;
- submodule path;
- remote ref and expected old object id for force-with-lease.

The result message includes recovery hints when recovery is possible.
