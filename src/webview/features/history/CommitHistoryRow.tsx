import type { KeyboardEvent, MouseEvent } from 'react';
import type { HistoryCommit, HistoryCommitRef } from '../../../protocol/history/types';
import { formatHistoryDate, formatRelativeDate } from './historyModel';
import { HistoryCommitSelectionMode } from './historyState';

interface CommitHistoryRowProps {
    readonly commit: HistoryCommit;
    readonly expanded: boolean;
    readonly selected: boolean;
    readonly showSelectionCheckbox: boolean;
    readonly childHash: string | undefined;
    readonly parentHash: string | undefined;
    readonly canUndoCommit: boolean;
    readonly canCherryPick: boolean;
    readonly hasMultipleSelectedCommits: boolean;
    readonly onSelect: (hash: string, mode: HistoryCommitSelectionMode) => void;
    readonly onContextMenu: () => void;
}

export function CommitHistoryRow({ commit, expanded, selected, showSelectionCheckbox, childHash, parentHash, canUndoCommit, canCherryPick, hasMultipleSelectedCommits, onSelect, onContextMenu }: CommitHistoryRowProps) {
    const disabledReasons = historyCommitDisabledReasons({ canCherryPick, canUndoCommit, hasMultipleSelectedCommits, childHash, parentHash });
    return (
        <div
            role="option"
            tabIndex={0}
            aria-selected={selected}
            aria-expanded={expanded}
            className={`history-row${showSelectionCheckbox ? ' history-row-selection-active' : ''}`}
            title={[commit.message, commit.hash, ...disabledReasons].join('\n')}
            data-history-commit-hash={commit.hash}
            data-vscode-context={JSON.stringify({
                webviewSection: 'historyCommit',
                historyCanGoToChild: childHash !== undefined,
                historyCanGoToParent: parentHash !== undefined,
                historyCanUndoCommit: canUndoCommit,
                historyCanCherryPick: canCherryPick,
                historyHasMultipleSelectedCommits: hasMultipleSelectedCommits,
                historyCommitDisabledReason: disabledReasons.join('\n'),
                preventDefaultContextMenuItems: true,
            })}
            onClick={(event) => onSelect(commit.hash, selectionModeForEvent(event))}
            onContextMenu={onContextMenu}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const rows = Array.from(document.querySelectorAll<HTMLElement>('.history-row'));
                    const idx = rows.indexOf(event.currentTarget);
                    const next = event.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
                    next?.focus();
                    if (event.shiftKey && next?.dataset.historyCommitHash) {
                        onSelect(next.dataset.historyCommitHash, HistoryCommitSelectionMode.Range);
                    }
                    return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(commit.hash, selectionModeForEvent(event));
                    return;
                }
                if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                    event.preventDefault();
                    if (!selected) { onSelect(commit.hash, HistoryCommitSelectionMode.Replace); }
                    openKeyboardContextMenu(event.currentTarget);
                }
            }}
        >
            {showSelectionCheckbox ? (
                <input
                    type="checkbox"
                    className="history-row-selection-checkbox"
                    aria-label={`Select commit ${commit.message}`}
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onSelect(commit.hash, HistoryCommitSelectionMode.Toggle)}
                />
            ) : null}
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
        </div>
    );
}

function selectionModeForEvent(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): HistoryCommitSelectionMode {
    if (event.shiftKey) { return HistoryCommitSelectionMode.Range; }
    if (event.metaKey || event.ctrlKey) { return HistoryCommitSelectionMode.Toggle; }
    return HistoryCommitSelectionMode.Replace;
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

function historyCommitDisabledReasons(input: {
    readonly canCherryPick: boolean;
    readonly canUndoCommit: boolean;
    readonly hasMultipleSelectedCommits: boolean;
    readonly childHash: string | undefined;
    readonly parentHash: string | undefined;
}): readonly string[] {
    const reasons: string[] = [];
    if (!input.canCherryPick) { reasons.push('Cherry-pick unavailable: selected commit already exists in the current branch history.'); }
    if (!input.hasMultipleSelectedCommits) { reasons.push('Squash Commits unavailable: select at least two commits.'); }
    if (!input.canUndoCommit) { reasons.push('Undo Commit unavailable: only the current HEAD commit can be undone.'); }
    if (!input.childHash) { reasons.push('Go to Child Commit unavailable: no visible child commit.'); }
    if (!input.parentHash) { reasons.push('Go to Parent Commit unavailable: no visible parent commit.'); }
    return reasons;
}

function openKeyboardContextMenu(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 12,
        clientY: rect.top + 12,
    }));
}
