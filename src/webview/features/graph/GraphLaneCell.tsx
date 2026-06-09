import { getLaneDataMaxLane, type LaneData, type LineDef } from './layout/graph-lane-model';
import { ROW_HEIGHT } from './graphRowSizing';

export const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const LINE_WIDTH = 2;

interface GraphLaneCellProps {
    readonly laneData: LaneData;
    readonly merge?: boolean;
    readonly wip?: boolean;
    readonly rowHeight?: number;
}

export function GraphLaneCell({ laneData, merge = false, wip = false, rowHeight = ROW_HEIGHT }: GraphLaneCellProps) {
    const width = (getLaneDataMaxLane(laneData) + 1) * LANE_WIDTH;
    const cx = (laneData.lane + 0.5) * LANE_WIDTH;
    const cy = rowHeight / 2;

    return (
        <svg
            className="graph-lane-svg"
            width={width}
            height={rowHeight}
            aria-hidden="true"
            style={{ minWidth: width }}
        >
            {laneData.lines.map((line, i) => (
                <LaneLine key={i} line={line} rowHeight={rowHeight} />
            ))}
            {wip ? (
                <circle
                    cx={cx}
                    cy={cy}
                    r={DOT_RADIUS}
                    fill="none"
                    stroke={laneData.color}
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                />
            ) : merge ? (
                <>
                    <circle
                        cx={cx}
                        cy={cy}
                        r={DOT_RADIUS + 1.5}
                        fill="var(--vscode-editor-background, #1e1e1e)"
                        stroke={laneData.color}
                        strokeWidth={2}
                    />
                    <circle
                        cx={cx}
                        cy={cy}
                        r={DOT_RADIUS - 1.5}
                        fill={laneData.color}
                    />
                </>
            ) : (
                <circle
                    cx={cx}
                    cy={cy}
                    r={DOT_RADIUS}
                    fill={laneData.color}
                    stroke="var(--vscode-editor-background, #1e1e1e)"
                    strokeWidth={1.5}
                />
            )}
        </svg>
    );
}

function LaneLine({ line, rowHeight }: { readonly line: LineDef; readonly rowHeight: number }) {
    const { fromLane, toLane, color, type, startY, endY } = line;
    const x1 = (fromLane + 0.5) * LANE_WIDTH;
    const x2 = (toLane + 0.5) * LANE_WIDTH;
    const y1 = yPosition(startY, rowHeight);
    const y2 = yPosition(endY, rowHeight);

    if (type === 'straight') {
        return (
            <line
                x1={x1} y1={y1}
                x2={x1} y2={y2}
                stroke={color}
                strokeWidth={LINE_WIDTH}
            />
        );
    }

    return (
        <line
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke={color}
            strokeWidth={LINE_WIDTH}
        />
    );
}

function yPosition(position: 'top' | 'center' | 'bottom', rowHeight: number): number {
    switch (position) {
        case 'top':
            return 0;
        case 'center':
            return rowHeight / 2;
        case 'bottom':
            return rowHeight;
    }
}
