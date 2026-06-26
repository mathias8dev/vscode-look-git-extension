import type { CSSProperties } from 'react';
import type { WorktreeWip } from '@protocol/graph/types';
import { getLaneDataMaxLane, type LaneData } from '@webview/features/graph/layout/graph-lane-model';
import { GraphLaneCell, LANE_WIDTH } from '@webview/features/graph/graph-lane-cell';

interface GraphWIPRowProps {
    readonly wip: WorktreeWip;
    readonly laneData: LaneData;
    readonly style: CSSProperties;
    readonly rowHeight?: number;
    readonly selected: boolean;
    readonly onSelect: (path: string) => void;
}

export function GraphWIPRow({ wip, laneData, style, rowHeight, selected, onSelect }: GraphWIPRowProps) {
    const dirName = wip.path.split(/[\\/]/).filter(Boolean).at(-1) ?? wip.path;
    const messageOffset = (getLaneDataMaxLane(laneData) + 1) * LANE_WIDTH + 4;
    const rowStyle: CSSProperties & { readonly '--graph-row-message-offset': string } = {
        ...style,
        '--graph-row-message-offset': `${messageOffset}px`,
    };
    return (
        <div
            className="graph-row graph-row-wip"
            style={rowStyle}
            tabIndex={0}
            title={wip.path}
            role="button"
            aria-selected={selected}
            onClick={() => onSelect(wip.path)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(wip.path);
                }
            }}
        >
            <div className="graph-lane-cell">
                <GraphLaneCell laneData={laneData} wip rowHeight={rowHeight} />
            </div>
            <div className="graph-message-cell graph-wip-message">
                <span className="wip-label">WIP</span>
                {wip.branch && (
                    <span className="ref-badge ref-badge-local">{wip.branch}</span>
                )}
                <span className="wip-stats">
                    {wip.staged > 0 && (
                        <span className="wip-staged" title={`${wip.staged} staged`}>
                            S{wip.staged}
                        </span>
                    )}
                    {wip.unstaged > 0 && (
                        <span className="wip-unstaged" title={`${wip.unstaged} unstaged`}>
                            M{wip.unstaged}
                        </span>
                    )}
                    {wip.untracked > 0 && (
                        <span className="wip-untracked" title={`${wip.untracked} untracked`}>
                            U{wip.untracked}
                        </span>
                    )}
                    {wip.conflicts > 0 && (
                        <span className="wip-conflict" title={`${wip.conflicts} conflicts`}>
                            C{wip.conflicts}
                        </span>
                    )}
                </span>
            </div>
            <div className="graph-author-cell graph-wip-path" title={wip.path}>
                {dirName}
            </div>
            <div className="graph-date-cell wip-date-cell">now</div>
        </div>
    );
}
