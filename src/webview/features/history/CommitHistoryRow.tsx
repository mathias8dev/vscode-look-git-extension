import type { HistoryCommit } from '../../../protocol/history/types';
import { formatHistoryDate } from './historyModel';

interface CommitHistoryRowProps {
    readonly commit: HistoryCommit;
    readonly selected: boolean;
    readonly expanded: boolean;
    readonly childHash: string | undefined;
    readonly parentHash: string | undefined;
    readonly canUndoCommit: boolean;
    readonly onSelect: (hash: string) => void;
    readonly onContextMenu: () => void;
}

export function CommitHistoryRow({ commit, selected, expanded, childHash, parentHash, canUndoCommit, onSelect, onContextMenu }: CommitHistoryRowProps) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
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
        >
            <i className={`codicon codicon-chevron-${expanded ? 'down' : 'right'} history-row-chevron`} aria-hidden="true" />
            <span className="history-row-main">
                <span className="history-row-message">{commit.message}</span>
                <span className="history-row-meta">
                    {commit.authorName} - {formatHistoryDate(commit.authorDate)}
                </span>
            </span>
            <span className="history-row-hash">{commit.shortHash}</span>
        </button>
    );
}
