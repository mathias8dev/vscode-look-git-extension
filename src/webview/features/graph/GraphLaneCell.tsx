import { getLaneDataMaxLane, type LaneData, type LineDef } from './layout/assignGraphLanes';

export const LANE_WIDTH = 16;
export const ROW_HEIGHT = 24;
const DOT_RADIUS = 4;
const LINE_WIDTH = 2;

interface GraphLaneCellProps {
    readonly laneData: LaneData;
}

export function GraphLaneCell({ laneData }: GraphLaneCellProps) {
    const width = (getLaneDataMaxLane(laneData) + 1) * LANE_WIDTH;
    const cx = (laneData.lane + 0.5) * LANE_WIDTH;
    const cy = ROW_HEIGHT / 2;

    return (
        <svg
            className="graph-lane-svg"
            width={width}
            height={ROW_HEIGHT}
            aria-hidden="true"
            style={{ minWidth: width }}
        >
            {laneData.lines.map((line, i) => (
                <LaneLine key={i} line={line} />
            ))}
            <circle
                cx={cx}
                cy={cy}
                r={DOT_RADIUS}
                fill={laneData.color}
                stroke="var(--vscode-editor-background, #1e1e1e)"
                strokeWidth={1.5}
            />
        </svg>
    );
}

function LaneLine({ line }: { line: LineDef }) {
    const { fromLane, toLane, color, type, startY, endY } = line;
    const x1 = (fromLane + 0.5) * LANE_WIDTH;
    const x2 = (toLane + 0.5) * LANE_WIDTH;
    const y1 = yPosition(startY);
    const y2 = yPosition(endY);

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

    const cpX1 = x1;
    const cpY1 = y1 + (y2 - y1) * 0.5;
    const cpX2 = x2;
    const cpY2 = y1 + (y2 - y1) * 0.5;

    return (
        <path
            d={`M ${x1} ${y1} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x2} ${y2}`}
            stroke={color}
            strokeWidth={LINE_WIDTH}
            fill="none"
        />
    );
}

function yPosition(position: 'top' | 'center' | 'bottom'): number {
    switch (position) {
        case 'top':
            return 0;
        case 'center':
            return ROW_HEIGHT / 2;
        case 'bottom':
            return ROW_HEIGHT;
    }
}
