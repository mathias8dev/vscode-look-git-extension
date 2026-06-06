import type { CSSProperties } from 'react';
import type { BranchInfo, GraphCommit } from '../../../protocol/graph/types';
import { getLaneDataMaxLane, type GraphRow } from './layout/assignGraphLanes';
import { GraphLaneCell, LANE_WIDTH } from './GraphLaneCell';
import { RefBadge } from './RefBadge';
import { parseRefs } from './refModel';

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
    readonly onMoveFocus: (currentHash: string, direction: 'previous' | 'next') => void;
}

export function GraphCommitRow({ row, branches, selected, childHash, parentHash, canUndoCommit, canCherryPick, hasMultipleSelectedCommits, rowHeight, style, onSelect, onOpenContextMenu, onBranchDoubleClick, onMoveFocus }: GraphRowProps) {
    const { commit, laneData } = row;
    const refs = parseRefs(commit.refs, branches);
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
            title={commit.message}
            data-graph-commit-hash={commit.hash}
            data-vscode-context={JSON.stringify({
                webviewSection: 'graphCommit',
                graphCommitCanGoToChild: childHash !== undefined,
                graphCommitCanGoToParent: parentHash !== undefined,
                graphCommitCanUndoCommit: canUndoCommit,
                graphCommitCanCherryPick: canCherryPick,
                graphCommitCanSquash: hasMultipleSelectedCommits,
                graphCommitHasMultipleSelectedCommits: hasMultipleSelectedCommits,
                preventDefaultContextMenuItems: true,
            })}
            onClick={(event) => {
                const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
                onSelect(commit.hash, mode);
            }}
            onContextMenu={() => onOpenContextMenu(commit)}
            onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    onMoveFocus(commit.hash, e.key === 'ArrowDown' ? 'next' : 'previous');
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(commit.hash, e.shiftKey ? 'range' : 'replace');
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
