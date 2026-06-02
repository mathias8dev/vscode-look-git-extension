import type { HistoryCommit, HistoryCommitRef } from '../../../protocol/history/types';
import { formatHistoryDate, formatRelativeDate } from './historyModel';

interface CommitHistoryRowProps {
    readonly commit: HistoryCommit;
    readonly expanded: boolean;
    readonly childHash: string | undefined;
    readonly parentHash: string | undefined;
    readonly canUndoCommit: boolean;
    readonly onSelect: (hash: string) => void;
    readonly onContextMenu: () => void;
}

export function CommitHistoryRow({ commit, expanded, childHash, parentHash, canUndoCommit, onSelect, onContextMenu }: CommitHistoryRowProps) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={expanded}
            aria-expanded={expanded}
            className="history-row"
            title={`${commit.message}\n${commit.hash}`}
            data-vscode-context={JSON.stringify({
                webviewSection: 'historyCommit',
                historyCanGoToChild: childHash !== undefined,
                historyCanGoToParent: parentHash !== undefined,
                historyCanUndoCommit: canUndoCommit,
                preventDefaultContextMenuItems: true,
            })}
            onClick={() => onSelect(commit.hash)}
            onContextMenu={onContextMenu}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const rows = Array.from(document.querySelectorAll<HTMLElement>('.history-row'));
                    const idx = rows.indexOf(event.currentTarget);
                    const next = event.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
                    next?.focus();
                }
            }}
        >
            <i className={`codicon codicon-chevron-${expanded ? 'down' : 'right'} history-row-chevron`} aria-hidden="true" />
            <span className="history-row-main">
                <span className="history-row-title">
                    <span className="history-row-message">{commit.message}</span>
                    <span className="history-row-refs">
                        {commit.refs.map((ref) => <HistoryRefBadge key={`${ref.kind}:${ref.name}`} refInfo={ref} />)}
                    </span>
                </span>
                <span className="history-row-meta">
                    <span className="history-row-author">{commit.authorName}</span>
                    <span
                        className="history-row-date"
                        title={formatHistoryDate(commit.authorDate)}
                    >
                        {formatRelativeDate(commit.authorDate)}
                    </span>
                </span>
            </span>
            <span className="history-row-hash">{commit.shortHash}</span>
        </button>
    );
}

function HistoryRefBadge({ refInfo }: { readonly refInfo: HistoryCommitRef }) {
    return (
        <span
            className={`history-ref-badge history-ref-badge-${refInfo.kind}`}
            title={refTitle(refInfo)}
        >
            <i className={`codicon codicon-${refIcon(refInfo)}`} aria-hidden="true" />
            <span className="history-ref-label">{refInfo.name}</span>
        </span>
    );
}

function refTitle(refInfo: HistoryCommitRef): string {
    if (refInfo.kind === 'remote') { return `Remote branch ${refInfo.name}`; }
    if (refInfo.kind === 'tag') { return `Tag ${refInfo.name}`; }
    return refInfo.isCurrent ? `Current branch ${refInfo.name}` : `Local branch ${refInfo.name}`;
}

function refIcon(refInfo: HistoryCommitRef): string {
    if (refInfo.kind === 'remote') { return 'cloud'; }
    if (refInfo.kind === 'tag') { return 'tag'; }
    return 'git-branch';
}
