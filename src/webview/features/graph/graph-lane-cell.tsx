import { useId } from 'react';
import { getLaneDataMaxLane, type LaneData, type LineDef } from '@webview/features/graph/layout/graph-lane-model';
import { ROW_HEIGHT } from '@webview/features/graph/graph-row-sizing';

export const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const LINE_WIDTH = 2;
const RING_RADIUS = DOT_RADIUS + 1.5;
const RING_STROKE_WIDTH = 2;

interface GraphLaneCellProps {
    readonly laneData: LaneData;
    readonly merge?: boolean;
    readonly wip?: boolean;
    readonly rowHeight?: number;
}

export function GraphLaneCell({ laneData, merge = false, wip = false, rowHeight = ROW_HEIGHT }: GraphLaneCellProps) {
    const maskId = `graph-marker-${useId()}`;
    const width = (getLaneDataMaxLane(laneData) + 1) * LANE_WIDTH;
    const cx = (laneData.lane + 0.5) * LANE_WIDTH;
    const cy = rowHeight / 2;
    const doubleRing = wip || merge;

    return (
        <svg
            className="graph-lane-svg"
            width={width}
            height={rowHeight}
            aria-hidden="true"
            style={{ minWidth: width }}
        >
            {doubleRing && (
                <defs>
                    <mask
                        id={maskId}
                        maskUnits="userSpaceOnUse"
                        maskContentUnits="userSpaceOnUse"
                        x={-LINE_WIDTH}
                        y={-LINE_WIDTH}
                        width={width + LINE_WIDTH * 2}
                        height={rowHeight + LINE_WIDTH * 2}
                        style={{ maskType: 'alpha' }}
                    >
                        <path d={markerLineMaskPath(width, rowHeight, cx, cy)} fillRule="evenodd" />
                    </mask>
                </defs>
            )}
            <g mask={doubleRing ? `url(#${maskId})` : undefined}>
                {laneData.lines.map((line, i) => (
                    <LaneLine key={i} line={line} rowHeight={rowHeight} />
                ))}
            </g>
            {doubleRing ? (
                <>
                    <circle
                        cx={cx}
                        cy={cy}
                        r={RING_RADIUS}
                        fill="none"
                        stroke={laneData.color}
                        strokeWidth={RING_STROKE_WIDTH}
                        strokeDasharray={wip ? '3 2' : undefined}
                    />
                    <circle
                        cx={cx}
                        cy={cy}
                        r={DOT_RADIUS - 1.5}
                        fill={wip ? 'none' : laneData.color}
                        stroke={wip ? laneData.color : undefined}
                        strokeWidth={wip ? 1.5 : undefined}
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

function markerLineMaskPath(width: number, rowHeight: number, cx: number, cy: number): string {
    const radius = RING_RADIUS + RING_STROKE_WIDTH / 2;
    const bounds = `M ${-LINE_WIDTH} ${-LINE_WIDTH} H ${width + LINE_WIDTH} V ${rowHeight + LINE_WIDTH} H ${-LINE_WIDTH} Z`;
    const cutout = `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    return `${bounds} ${cutout}`;
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
                strokeLinecap="round"
            />
        );
    }

    return (
        <path
            d={bezierPath(x1, y1, x2, y2, startY, endY)}
            fill="none"
            stroke={color}
            strokeWidth={LINE_WIDTH}
            strokeLinecap="round"
        />
    );
}

function bezierPath(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    startY: LineDef['startY'],
    endY: LineDef['endY'],
): string {
    const verticalDistance = Math.max(1, Math.abs(y2 - y1));
    const horizontalDistance = Math.abs(x2 - x1);
    const bend = Math.min(Math.max(verticalDistance * 0.65, horizontalDistance * 0.35), verticalDistance);
    const c1y = startY === 'top' ? y1 + bend : y1 + bend * 0.5;
    const c2y = endY === 'bottom' ? y2 - bend : y2 - bend * 0.5;
    return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
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
