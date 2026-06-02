import { useEffect, useRef, useState } from 'react';
import type { HistoryToolbarCommand } from '../../../protocol/history/messages';
import type { HistoryState } from './historyState';
import type { HistoryCommit, HistoryCommitFile, HistoryContextTarget } from '../../../protocol/history/types';
import { CommitHistoryFileList } from './CommitHistoryFileList';
import { CommitHistoryRow } from './CommitHistoryRow';
import { filterHistoryCommits, historyEmptyLabel, selectedHistoryCommit } from './historyModel';
import { ErrorNotice } from '../../shared/ErrorNotice';

interface CommitHistoryAppProps {
    readonly state: HistoryState;
    readonly query: string;
    readonly fileViewMode: 'list' | 'tree';
    readonly onQueryChange: (query: string) => void;
    readonly onRefresh: () => void;
    readonly onToolbarCommand: (command: HistoryToolbarCommand) => void;
    readonly onFileViewModeChange: (mode: 'list' | 'tree') => void;
    readonly onSelectCommit: (hash: string) => void;
    readonly onOpenFileDiff: (hash: string, file: HistoryCommitFile) => void;
    readonly onContextTarget: (target: HistoryContextTarget) => void;
    readonly onLoadMore: () => void;
}

export function CommitHistoryApp({
    state,
    query,
    fileViewMode,
    onQueryChange,
    onRefresh,
    onToolbarCommand,
    onFileViewModeChange,
    onSelectCommit,
    onOpenFileDiff,
    onContextTarget,
    onLoadMore,
}: CommitHistoryAppProps) {
    const commits = filterHistoryCommits(state.commits, query);
    const selectedCommit = selectedHistoryCommit(state.commits, state.selectedHash);
    const selectedDetails = selectedCommit ? state.detailsByHash[selectedCommit.hash] : undefined;

    return (
        <main className="history-shell">
            <header className="history-header">
                <div className="history-title">
                    <h1>Commit History</h1>
                    <span>{state.loadedCount}</span>
                </div>
                <HistoryToolbar
                    loading={state.loading}
                    fileViewMode={fileViewMode}
                    onRefresh={onRefresh}
                    onToolbarCommand={onToolbarCommand}
                    onFileViewModeChange={onFileViewModeChange}
                />
            </header>

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
                    <div className="history-empty">{historyEmptyLabel(state.commits, query)}</div>
                ) : null}

                {commits.map((commit) => {
                    const expanded = commit.hash === state.selectedHash;
                    return (
                        <div key={commit.hash} className="history-item">
                            <CommitHistoryRow
                                commit={commit}
                                selected={expanded}
                                expanded={expanded}
                                childHash={childHash(state.commits, commit.hash)}
                                parentHash={commit.parentHashes[0]}
                                canUndoCommit={state.commits[0]?.hash === commit.hash}
                                onSelect={onSelectCommit}
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
                                <CommitHistoryFileList
                                    details={state.detailsByHash[commit.hash]}
                                    viewMode={fileViewMode}
                                    loading={state.detailsLoadingHash === commit.hash}
                                    onOpenDiff={(file) => onOpenFileDiff(commit.hash, file)}
                                    onFileContextMenu={(file) => onContextTarget({ kind: 'file', commitHash: commit.hash, file })}
                                />
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

            {selectedCommit ? (
                <aside className="history-details" aria-label="Selected commit">
                    <p className="history-details-message">{selectedDetails?.fullMessage || selectedCommit.message}</p>
                    <dl>
                        <div>
                            <dt>Revision</dt>
                            <dd>{selectedCommit.hash}</dd>
                        </div>
                        <div>
                            <dt>Author</dt>
                            <dd>{selectedCommit.authorName}</dd>
                        </div>
                        <div>
                            <dt>Date</dt>
                            <dd>{selectedCommit.authorDate}</dd>
                        </div>
                    </dl>
                </aside>
            ) : null}
        </main>
    );
}

function HistoryToolbar({
    loading,
    fileViewMode,
    onRefresh,
    onToolbarCommand,
    onFileViewModeChange,
}: {
    readonly loading: boolean;
    readonly fileViewMode: 'list' | 'tree';
    readonly onRefresh: () => void;
    readonly onToolbarCommand: (command: HistoryToolbarCommand) => void;
    readonly onFileViewModeChange: (mode: 'list' | 'tree') => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) { return; }
        const onPointerDown = (event: MouseEvent) => {
            if (menuRef.current?.contains(event.target as Node)) { return; }
            setMenuOpen(false);
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, [menuOpen]);

    return (
        <div className="history-toolbar" aria-label="Commit history actions">
            <HistoryToolbarButton icon="git-branch" title="Select Branch" onClick={() => onToolbarCommand('selectBranch')} />
            <HistoryToolbarButton icon="target" title="Go to Current History Item" onClick={() => onToolbarCommand('goToCurrent')} />
            <HistoryToolbarButton icon="cloud-download" title="Fetch from All Remotes" onClick={() => onToolbarCommand('fetchAll')} />
            <HistoryToolbarButton icon="repo-pull" title="Pull" onClick={() => onToolbarCommand('pull')} />
            <HistoryToolbarButton icon="repo-push" title="Push" onClick={() => onToolbarCommand('push')} />
            <button
                type="button"
                className="history-icon-button"
                title="Refresh"
                aria-label="Refresh"
                onClick={onRefresh}
            >
                <i className={`codicon codicon-${loading ? 'loading codicon-modifier-spin' : 'refresh'}`} aria-hidden="true" />
            </button>
            <div className="history-toolbar-menu-host" ref={menuRef}>
                <button
                    type="button"
                    className="history-icon-button"
                    title="More Actions"
                    aria-label="More Actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <i className="codicon codicon-more" aria-hidden="true" />
                </button>
                {menuOpen ? (
                    <div className="history-view-menu" role="menu">
                        <HistoryViewModeItem
                            label="View as List"
                            selected={fileViewMode === 'list'}
                            onClick={() => {
                                onFileViewModeChange('list');
                                setMenuOpen(false);
                            }}
                        />
                        <HistoryViewModeItem
                            label="View as Tree"
                            selected={fileViewMode === 'tree'}
                            onClick={() => {
                                onFileViewModeChange('tree');
                                setMenuOpen(false);
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function HistoryToolbarButton({ icon, title, onClick }: { readonly icon: string; readonly title: string; readonly onClick: () => void }) {
    return (
        <button type="button" className="history-icon-button" title={title} aria-label={title} onClick={onClick}>
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
    );
}

function HistoryViewModeItem({ label, selected, onClick }: { readonly label: string; readonly selected: boolean; readonly onClick: () => void }) {
    return (
        <button type="button" role="menuitemradio" aria-checked={selected} onClick={onClick}>
            {selected ? <i className="codicon codicon-check" aria-hidden="true" /> : <span className="history-view-menu-check" aria-hidden="true" />}
            <span>{label}</span>
        </button>
    );
}

function childHash(commits: readonly HistoryCommit[], hash: string): string | undefined {
    return commits.find((commit) => commit.parentHashes.includes(hash))?.hash;
}
