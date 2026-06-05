import type { HistoryState } from './historyState';
import type { HistoryToolbarCommand } from '../../../protocol/history/messages';
import { OperationStatus } from '../../../protocol/shared/operation';
import type { HistoryCommit, HistoryCommitFile, HistoryContextTarget } from '../../../protocol/history/types';
import { CommitHistoryFileList } from './CommitHistoryFileList';
import { CommitHistoryRow } from './CommitHistoryRow';
import { filterHistoryCommits, formatHistoryDate, historyEmptyLabel, parseCommitMessage, formatRelativeDate } from './historyModel';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { OperationNotice } from '../../shared/OperationNotice';
import { SearchInput } from '../../shared/SearchInput';

interface CommitHistoryAppProps {
    readonly state: HistoryState;
    readonly query: string;
    readonly fileViewMode: 'list' | 'tree';
    readonly onQueryChange: (query: string) => void;
    readonly onToggleCommit: (hash: string) => void;
    readonly onOpenFileDiff: (hash: string, file: HistoryCommitFile) => void;
    readonly onContextTarget: (target: HistoryContextTarget) => void;
    readonly onLoadMore: () => void;
    readonly onCopyHash: (hash: string) => void;
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
    onCopyHash,
}: CommitHistoryAppProps) {
    const commits = filterHistoryCommits(state.commits, query);

    return (
        <main className="history-shell">
            <SearchInput
                className="history-search"
                value={query}
                placeholder="Search commits"
                ariaLabel="Search commits"
                onChange={onQueryChange}
            />

            <ErrorNotice error={state.error} />
            {state.operationStatus ? (
                <OperationNotice
                    status={state.operationStatus.status}
                    message={historyOperationMessage(state.operationStatus.command, state.operationStatus.status)}
                />
            ) : null}

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
                        {query.trim() ? (
                            <button type="button" className="history-empty-action" onClick={() => onQueryChange('')}>
                                Clear filters
                            </button>
                        ) : null}
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
                                                onClick={() => onCopyHash(commit.hash)}
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

function historyOperationMessage(command: HistoryToolbarCommand, status: OperationStatus): string {
    const label = historyOperationLabel(command);
    switch (status) {
        case OperationStatus.Running:
            return `${sentenceCase(label)}...`;
        case OperationStatus.Success:
            return `${pastTense(label)}.`;
        case OperationStatus.Failed:
            return `Could not ${label}.`;
        case OperationStatus.Conflict:
            return `${sentenceCase(label)} stopped with conflicts.`;
    }
}

function historyOperationLabel(command: HistoryToolbarCommand): string {
    switch (command) {
        case 'fetchAll':
            return 'fetch all remotes';
        case 'pull':
            return 'pull';
        case 'push':
            return 'push';
        case 'selectRepositoryScope':
            return 'select repository';
        case 'selectBranch':
            return 'select branch';
        case 'goToCurrent':
            return 'go to current item';
    }
}

function pastTense(label: string): string {
    if (label.startsWith('fetch ')) { return sentenceCase(label.replace(/^fetch /, 'fetched ')); }
    if (label === 'pull') { return 'Pulled'; }
    if (label === 'push') { return 'Pushed'; }
    return `${sentenceCase(label)} completed`;
}

function sentenceCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function childHash(commits: readonly HistoryCommit[], hash: string): string | undefined {
    return commits.find((commit) => commit.parentHashes.includes(hash))?.hash;
}
