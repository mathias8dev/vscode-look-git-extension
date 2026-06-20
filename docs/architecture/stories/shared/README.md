# Shared Runtime and Context Stories

High-level sequence: [repo-context-change-sequence.mermaid](repo-context-change-sequence.mermaid)

## Story: Active Repository Context Change

As a developer, I want all open Look Git webviews to follow the active repository so that each feature shows the same repository context.

Implementation: [active-repository-context-change.mermaid](active-repository-context-change.mermaid)

## Story: Remote Operation Runtime Selection

As a developer, I want remote operations to use the runtime that can authenticate successfully so that fetch, pull, and push work with VS Code credentials, CLI credentials, or a future Look-native credential manager.

Implementation: [remote-runtime-selection.mermaid](remote-runtime-selection.mermaid)

## Story: Locator Resolution

As a developer, I want webview protocol messages to carry locators instead of paths pretending to be repositories so that the extension can resolve main repos, submodules, and worktrees consistently.

Implementation: [locator-resolution.mermaid](locator-resolution.mermaid)

## Story: Guarded Operation Acknowledgement

As a developer, I want guarded git actions to show their targets, previews, and required acknowledgements before execution so that destructive or risky operations are explicit and validated by the host.

Implementation: [guarded-operation-acknowledgement.mermaid](guarded-operation-acknowledgement.mermaid)
