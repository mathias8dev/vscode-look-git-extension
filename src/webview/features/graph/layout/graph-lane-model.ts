import type { GraphCommit } from '@protocol/graph/types';

export interface GraphRow {
    readonly commit: GraphCommit;
    readonly laneData: LaneData;
}

export interface LaneData {
    readonly lane: number;
    readonly color: string;
    readonly lines: readonly LineDef[];
    readonly isPrimary: boolean;
}

export interface LineDef {
    readonly fromLane: number;
    readonly toLane: number;
    readonly color: string;
    readonly type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right';
    readonly targetHash?: string;
    readonly hiddenTargetHash?: string;
    readonly role: 'pass-through' | 'first-parent' | 'merge-parent';
    readonly startY: 'top' | 'center';
    readonly endY: 'center' | 'bottom';
}

export function getMaxLane(rows: readonly GraphRow[]): number {
    let max = 0;
    for (const row of rows) {
        const rowMax = getLaneDataMaxLane(row.laneData);
        if (rowMax > max) { max = rowMax; }
    }
    return max;
}

export function getLaneDataMaxLane(laneData: LaneData): number {
    let max = laneData.lane;
    for (const line of laneData.lines) {
        if (line.fromLane > max) { max = line.fromLane; }
        if (line.toLane > max) { max = line.toLane; }
    }
    return max;
}
