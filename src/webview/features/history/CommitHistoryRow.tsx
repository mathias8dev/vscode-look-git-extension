import type { HistoryCommit } from '../../../protocol/history/types';
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
                <span className="history-row-message">{commit.message}</span>
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
