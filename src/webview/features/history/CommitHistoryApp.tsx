import type { HistoryState } from './historyState';
import type { HistoryCommit, HistoryCommitFile, HistoryContextTarget } from '../../../protocol/history/types';
import { CommitHistoryFileList } from './CommitHistoryFileList';
import { CommitHistoryRow } from './CommitHistoryRow';
import { filterHistoryCommits, formatHistoryDate, historyEmptyLabel, parseCommitMessage, formatRelativeDate } from './historyModel';
import { ErrorNotice } from '../../shared/ErrorNotice';

interface CommitHistoryAppProps {
    readonly state: HistoryState;
    readonly query: string;
    readonly fileViewMode: 'list' | 'tree';
    readonly onQueryChange: (query: string) => void;
    readonly onToggleCommit: (hash: string) => void;
    readonly onOpenFileDiff: (hash: string, file: HistoryCommitFile) => void;
    readonly onContextTarget: (target: HistoryContextTarget) => void;
    readonly onLoadMore: () => void;
}

export function CommitHistoryApp({
    state,
    query,
    fileViewMode,
    onQueryChange,
    onToggleCommit,
    onOpenFileDiff,
    onContextTarget,
    onLoadMore,
}: CommitHistoryAppProps) {
    const commits = filterHistoryCommits(state.commits, query);

    return (
        <main className="history-shell">
            <div className="history-search">
                <i className="codicon codicon-search history-search-icon" aria-hidden="true" />
                <input
                    value={query}
                    placeholder="Search commits"
                    aria-label="Search commits"
                    onChange={(event) => onQueryChange(event.currentTarget.value)}
                />
            </div>

            <ErrorNotice error={state.error} />

            <section className="history-list" role="listbox" aria-label="Commits">
                {state.loading && state.commits.length === 0 ? (
                    <div className="history-loading">
                        <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                        <span>Loading commits...</span>
                    </div>
                ) : null}

                {!state.loading && commits.length === 0 ? (
                    <div className="history-empty">
                        <i className="codicon codicon-git-commit history-empty-icon" aria-hidden="true" />
                        <span>{historyEmptyLabel(state.commits, query)}</span>
                    </div>
                ) : null}

                {commits.map((commit) => {
                    const expanded = state.expandedHashes.includes(commit.hash);
                    const details = state.detailsByHash[commit.hash];
                    return (
                        <div key={commit.hash} className="history-item">
                            <CommitHistoryRow
                                commit={commit}
                                expanded={expanded}
                                childHash={childHash(state.commits, commit.hash)}
                                parentHash={commit.parentHashes[0]}
                                canUndoCommit={state.commits[0]?.hash === commit.hash}
                                onSelect={onToggleCommit}
                                onContextMenu={() => onContextTarget({
                                    kind: 'commit',
                                    hash: commit.hash,
                                    hashes: [commit.hash],
                                    childHash: childHash(state.commits, commit.hash),
                                    parentHash: commit.parentHashes[0],
                                    canUndoCommit: state.commits[0]?.hash === commit.hash,
                                })}
                            />
                            {expanded ? (
                                <div className="history-item-expanded">
                                    <div className="history-item-meta">
                                        {(() => {
                                            const { body } = parseCommitMessage(details?.fullMessage ?? commit.message);
                                            return body ? <p className="history-item-body">{body}</p> : null;
                                        })()}
                                        <div className="history-item-info">
                                            <span className="history-item-author">{commit.authorName}</span>
                                            <span className="history-item-sep" aria-hidden="true">·</span>
                                            <span
                                                className="history-item-date"
                                                title={formatHistoryDate(commit.authorDate)}
                                            >
                                                {formatRelativeDate(commit.authorDate)}
                                            </span>
                                            <span className="history-item-sep" aria-hidden="true">·</span>
                                            <button
                                                type="button"
                                                className="history-copy-hash"
                                                title="Copy full hash"
                                                onClick={() => navigator.clipboard.writeText(commit.hash).catch(() => {})}
                                            >
                                                {commit.shortHash}
                                                <i className="codicon codicon-copy" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                    <CommitHistoryFileList
                                        details={details}
                                        viewMode={fileViewMode}
                                        loading={state.detailsLoadingHash === commit.hash}
                                        onOpenDiff={(file) => onOpenFileDiff(commit.hash, file)}
                                        onFileContextMenu={(file) => onContextTarget({ kind: 'file', commitHash: commit.hash, file })}
                                    />
                                </div>
                            ) : null}
                        </div>
                    );
                })}

                {state.hasMore && !query.trim() ? (
                    <button
                        type="button"
                        className="history-load-more"
                        disabled={state.loadingMore}
                        onClick={onLoadMore}
                    >
                        {state.loadingMore ? 'Loading commits...' : 'Load more commits'}
                    </button>
                ) : null}
            </section>
        </main>
    );
}

function childHash(commits: readonly HistoryCommit[], hash: string): string | undefined {
    return commits.find((commit) => commit.parentHashes.includes(hash))?.hash;
}
