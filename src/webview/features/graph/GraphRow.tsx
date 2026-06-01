import type { CSSProperties } from 'react';
import type { BranchInfo } from '../../../protocol/graph/types';
import type { GraphRow } from './layout/assignGraphLanes';
import { GraphLaneCell, LANE_WIDTH } from './GraphLaneCell';
import { RefBadge } from './RefBadge';
import { parseRefs } from './refModel';
import { messageForBranchCheckout } from './graphCommands';

interface GraphRowProps {
    readonly row: GraphRow;
    readonly branches: readonly BranchInfo[];
    readonly maxLane: number;
    readonly selected: boolean;
    readonly style: CSSProperties;
    readonly onSelect: (hash: string) => void;
    readonly onPostMessage: (msg: unknown) => void;
}

export function GraphCommitRow({ row, branches, maxLane, selected, style, onSelect, onPostMessage }: GraphRowProps) {
    const { commit, laneData } = row;
    const refs = parseRefs(commit.refs, branches);
    const colWidth = (maxLane + 1) * LANE_WIDTH + 4;
    const rowStyle: CSSProperties & { readonly '--graph-col-width': string } = {
        ...style,
        '--graph-col-width': `${colWidth}px`,
    };

    return (
        <div
            className="graph-row"
            style={rowStyle}
            aria-selected={selected}
            tabIndex={0}
            title={commit.message}
            onClick={() => onSelect(commit.hash)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(commit.hash);
                }
            }}
        >
            <div className="graph-lane-cell">
                <GraphLaneCell laneData={laneData} maxLane={maxLane} />
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
