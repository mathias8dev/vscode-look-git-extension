import type { CSSProperties } from 'react';
import type { BranchInfo, GraphCommit } from '../../../protocol/graph/types';
import { getLaneDataMaxLane, type GraphRow } from './layout/assignGraphLanes';
import { GraphLaneCell, LANE_WIDTH } from './GraphLaneCell';
import { RefBadge } from './RefBadge';
import { parseRefs } from './refModel';
import { messageForBranchCheckout } from './graphCommands';

export type CommitSelectMode = 'replace' | 'toggle' | 'range';

interface GraphRowProps {
    readonly row: GraphRow;
    readonly branches: readonly BranchInfo[];
    readonly selected: boolean;
    readonly style: CSSProperties;
    readonly onSelect: (hash: string, mode: CommitSelectMode) => void;
    readonly onOpenContextMenu: (commit: GraphCommit, x: number, y: number) => void;
    readonly onPostMessage: (msg: unknown) => void;
}

export function GraphCommitRow({ row, branches, selected, style, onSelect, onOpenContextMenu, onPostMessage }: GraphRowProps) {
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
            onClick={(event) => {
                const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
                onSelect(commit.hash, mode);
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                onOpenContextMenu(commit, event.clientX, event.clientY);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(commit.hash, e.shiftKey ? 'range' : 'replace');
                }
            }}
        >
            <div className="graph-lane-cell">
                <GraphLaneCell laneData={laneData} />
            </div>
            <div className="graph-message-cell">
                {refs.map((ref) => (
                    <RefBadge
                        key={ref.fullRef}
                        parsed={ref}
                        onDoubleClick={ref.kind === 'local'
                            ? () => onPostMessage(messageForBranchCheckout(ref.label, false))
                            : undefined}
                    />
                ))}
                <span className="graph-message-text">{commit.message}</span>
            </div>
            <div className="graph-author-cell" title={`${commit.authorName} <${commit.authorEmail}>`}>
                {commit.authorName}
            </div>
            <div className="graph-date-cell">{formatDate(commit.authorDate)}</div>
        </div>
    );
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
    } catch {
        return iso;
    }
}
