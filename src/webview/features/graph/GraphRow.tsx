import type { CSSProperties } from 'react';
import type { BranchInfo, GraphCommit } from '@protocol/graph/types';
import { getLaneDataMaxLane, type GraphRow } from '@webview/features/graph/layout/graph-lane-model';
import { GraphLaneCell, LANE_WIDTH } from '@webview/features/graph/GraphLaneCell';
import { RefBadge } from '@webview/features/graph/RefBadge';
import { parseRefs } from '@webview/features/graph/refModel';

export type CommitSelectMode = 'replace' | 'toggle' | 'range';

interface GraphRowProps {
    readonly row: GraphRow;
    readonly branches: readonly BranchInfo[];
    readonly selected: boolean;
    readonly childHash: string | undefined;
    readonly parentHash: string | undefined;
    readonly canUndoCommit: boolean;
    readonly canCherryPick: boolean;
    readonly hasMultipleSelectedCommits: boolean;
    readonly rowHeight?: number;
    readonly style: CSSProperties;
    readonly onSelect: (hash: string, mode: CommitSelectMode) => void;
    readonly onOpenContextMenu: (commit: GraphCommit) => void;
    readonly onBranchDoubleClick: (branch: string, isRemote: boolean) => void;
    readonly onMoveFocus: (currentHash: string, direction: 'previous' | 'next', mode?: CommitSelectMode) => void;
}

export function GraphCommitRow({ row, branches, selected, childHash, parentHash, canUndoCommit, canCherryPick, hasMultipleSelectedCommits, rowHeight, style, onSelect, onOpenContextMenu, onBranchDoubleClick, onMoveFocus }: GraphRowProps) {
    const { commit, laneData } = row;
    const refs = parseRefs(commit.refs, branches);
    const disabledReasons = graphCommitDisabledReasons({ canCherryPick, canUndoCommit, hasMultipleSelectedCommits, childHash, parentHash });
    const messageOffset = (getLaneDataMaxLane(laneData) + 1) * LANE_WIDTH + 4;
    const rowStyle: CSSProperties & { readonly '--graph-row-message-offset': string } = {
        ...style,
        '--graph-row-message-offset': `${messageOffset}px`,
    };

    return (
        <div
            className="graph-row"
            style={rowStyle}
            aria-selected={selected}
            tabIndex={0}
            title={[commit.message, ...disabledReasons].join('\n')}
            data-graph-commit-hash={commit.hash}
            data-vscode-context={JSON.stringify({
                webviewSection: 'graphCommit',
                graphCommitCanGoToChild: childHash !== undefined,
                graphCommitCanGoToParent: parentHash !== undefined,
                graphCommitCanUndoCommit: canUndoCommit,
                graphCommitCanCherryPick: canCherryPick,
                graphCommitCanSquash: hasMultipleSelectedCommits,
                graphCommitHasMultipleSelectedCommits: hasMultipleSelectedCommits,
                graphCommitDisabledReason: disabledReasons.join('\n'),
                preventDefaultContextMenuItems: true,
            })}
            onClick={(event) => {
                const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
                onSelect(commit.hash, mode);
            }}
            onMouseDown={(event) => {
                if (event.button === 2) { onOpenContextMenu(commit); }
            }}
            onContextMenu={() => onOpenContextMenu(commit)}
            onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    onMoveFocus(commit.hash, e.key === 'ArrowDown' ? 'next' : 'previous', e.shiftKey ? 'range' : undefined);
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(commit.hash, e.shiftKey ? 'range' : 'replace');
                    return;
                }
                if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
                    e.preventDefault();
                    onOpenContextMenu(commit);
                    openKeyboardContextMenu(e.currentTarget);
                }
            }}
        >
            <div className="graph-lane-cell">
                <GraphLaneCell laneData={laneData} merge={commit.parentHashes.length > 1} rowHeight={rowHeight} />
            </div>
            <div className="graph-message-cell">
                {refs.map((ref) => (
                    <RefBadge
                        key={ref.fullRef}
                        parsed={ref}
                        onDoubleClick={ref.kind === 'local'
                            ? () => onBranchDoubleClick(ref.label, false)
                            : undefined}
                    />
                ))}
                <span className="graph-message-text">{commit.message}</span>
            </div>
            <div className="graph-author-cell" title={`${commit.authorName} <${commit.authorEmail}>`}>
                {commit.authorName}
            </div>
            <div className="graph-date-cell" title={commit.authorDate}>{formatGraphCommitDate(commit.authorDate)}</div>
        </div>
    );
}

function formatGraphCommitDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) { return iso; }
    return [
        date.getFullYear(),
        twoDigits(date.getMonth() + 1),
        twoDigits(date.getDate()),
    ].join('-') + ' ' + [
        twoDigits(date.getHours()),
        twoDigits(date.getMinutes()),
        twoDigits(date.getSeconds()),
    ].join(':');
}

function twoDigits(value: number): string {
    return String(value).padStart(2, '0');
}

function graphCommitDisabledReasons(input: {
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
