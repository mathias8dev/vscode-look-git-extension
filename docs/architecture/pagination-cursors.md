# Pagination Cursors

Cursor pagination is required for large and changing git datasets. The protocol carries cursors as opaque JSON-safe strings, but the extension owns their decoded shape and validation.

## Contract

`PageRequest.cursor` is optional on the first request. When present, it must have been produced by the previous `Page.nextCursor` for the same logical query.

The extension must reject or restart pagination when the cursor does not match the current query.

## Cursor State

The decoded cursor state contains:

- `kind`: dataset type, such as `commit-history`, `graph`, `file-history`, `compare-files`, `stash`, `reflog`, `untracked-files`, or `submodules`.
- `repositoryId`: repository that produced the cursor.
- `worktreeId`: worktree that produced the cursor, when the dataset is checkout-scoped.
- `queryHash`: stable hash of filters, revision range, path, sort, traversal mode, and feature-specific options.
- `anchor`: last item emitted by the previous page.
- `snapshot`: optional consistency marker for the dataset.
- `direction`: `forward` or `backward`.

The protocol does not expose those fields directly. It carries an encoded cursor so webviews cannot accidentally construct invalid cursors.

## Dataset Rules

Commit graph/history cursors use the last emitted commit hash as `anchor`. Their `queryHash` includes revision range, path filters, author/message/date filters, first-parent mode, ordering mode, and graph filters.

File history cursors include the path-follow mode in `queryHash`. If rename-following is enabled, the cursor may include the current historical path in the encoded state.

Compare cursors include base ref, head ref, path filters, rename detection mode, and ordering in `queryHash`.

Reflog cursors include reflog selector and ordering in `queryHash`.

Status-like cursors, such as untracked and ignored files, include worktree id, path filters, and grouping/sort options in `queryHash`.

## Snapshot Rules

Some git datasets can change while the user pages:

- branch heads can move;
- the working tree can change;
- refs can be fetched or pruned;
- submodules can be initialized or updated.

For immutable commit traversal from explicit commit hashes, `snapshot` may be omitted.

For ref-based traversal, `snapshot` should include the resolved ref tips used for the first page. If the current ref tips differ on a later request, the use case must either restart from the first page or return a stale-cursor error.

For worktree datasets, `snapshot` should include a cheap status generation marker when available. If unavailable, use cases must tolerate duplicates/misses by reconciling item ids in the webview reducer.

## Page Shape

`Page<T>` contains:

- `items`: bounded list of results;
- `nextCursor`: encoded cursor for the next page;
- `hasMore`: whether another page is expected.

`nextCursor` is omitted when `hasMore` is false.

## Error Behavior

Invalid cursors, mismatched query hashes, mismatched repository/worktree ids, and stale snapshots must produce a typed protocol error. The webview should then reset the feature state and request the first page again.
