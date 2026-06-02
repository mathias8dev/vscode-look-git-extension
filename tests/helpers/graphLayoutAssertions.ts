import type { GraphRow, LineDef } from '../../src/webview/features/graph/layout/assignGraphLanes';

export interface FloatingNodeIssue {
    readonly hash: string;
    readonly lane: number;
    readonly reason: 'missing-incoming' | 'missing-outgoing';
}

export interface LaneContinuityIssue {
    readonly rowIndex: number;
    readonly hash: string;
    readonly lane: number;
    readonly reason: 'active-lane-not-rendered' | 'line-starts-without-active-lane' | 'conflicting-bottom-target';
    readonly targetHash?: string;
}

export interface NonVisibleLineTargetIssue {
    readonly rowIndex: number;
    readonly hash: string;
    readonly targetHash: string;
}

export interface CommitLanePassThroughIssue {
    readonly rowIndex: number;
    readonly hash: string;
    readonly lane: number;
    readonly targetHash?: string;
}

export interface AdjacentDisconnectedSameLaneIssue {
    readonly rowIndex: number;
    readonly hash: string;
    readonly nextHash: string;
    readonly lane: number;
}

export function findFloatingNodeIssues(rows: readonly GraphRow[]): readonly FloatingNodeIssue[] {
    const rowsByHash = new Map(rows.map((row) => [row.commit.hash, row]));
    const hashesWithVisibleChildren = new Set<string>();

    for (const row of rows) {
        for (const parentHash of row.commit.parentHashes) {
            if (rowsByHash.has(parentHash)) {
                hashesWithVisibleChildren.add(parentHash);
            }
        }
    }

    const issues: FloatingNodeIssue[] = [];
    for (const row of rows) {
        const lane = row.laneData.lane;
        const hasVisibleChild = hashesWithVisibleChildren.has(row.commit.hash);
        const hasVisibleParent = row.commit.parentHashes.some((parentHash) => rowsByHash.has(parentHash));

        if (hasVisibleChild && !row.laneData.lines.some((line) => touchesIncomingCenter(line, lane))) {
            issues.push({ hash: row.commit.hash, lane, reason: 'missing-incoming' });
        }
        if (hasVisibleParent && !row.laneData.lines.some((line) => touchesOutgoingCenter(line, lane))) {
            issues.push({ hash: row.commit.hash, lane, reason: 'missing-outgoing' });
        }
    }

    return issues;
}

export function findLaneContinuityIssues(rows: readonly GraphRow[]): readonly LaneContinuityIssue[] {
    const visibleHashes = new Set(rows.map((row) => row.commit.hash));
    const issues: LaneContinuityIssue[] = [];
    let active = new Map<number, string>();

    rows.forEach((row, rowIndex) => {
        for (const line of row.laneData.lines) {
            if (line.startY === 'top' && !active.has(line.fromLane)) {
                issues.push({
                    rowIndex,
                    hash: row.commit.hash,
                    lane: line.fromLane,
                    reason: 'line-starts-without-active-lane',
                    targetHash: line.targetHash,
                });
            }
        }

        for (const [lane, targetHash] of active) {
            const rendered = row.laneData.lines.some((line) => line.startY === 'top' && line.fromLane === lane);
            if (!rendered) {
                issues.push({
                    rowIndex,
                    hash: row.commit.hash,
                    lane,
                    reason: 'active-lane-not-rendered',
                    targetHash,
                });
            }
        }

        const nextActive = new Map<number, string>();
        for (const line of row.laneData.lines) {
            if (line.endY !== 'bottom' || !line.targetHash || !visibleHashes.has(line.targetHash)) { continue; }
            const existing = nextActive.get(line.toLane);
            if (existing && existing !== line.targetHash) {
                issues.push({
                    rowIndex,
                    hash: row.commit.hash,
                    lane: line.toLane,
                    reason: 'conflicting-bottom-target',
                    targetHash: line.targetHash,
                });
            }
            nextActive.set(line.toLane, line.targetHash);
        }
        active = nextActive;
    });

    return issues;
}

export function findNonVisibleLineTargetIssues(rows: readonly GraphRow[]): readonly NonVisibleLineTargetIssue[] {
    const visibleHashes = new Set(rows.map((row) => row.commit.hash));
    const issues: NonVisibleLineTargetIssue[] = [];
    rows.forEach((row, rowIndex) => {
        for (const line of row.laneData.lines) {
            if (!line.targetHash || visibleHashes.has(line.targetHash)) { continue; }
            issues.push({ rowIndex, hash: row.commit.hash, targetHash: line.targetHash });
        }
    });
    return issues;
}

export function findCommitLanePassThroughIssues(rows: readonly GraphRow[]): readonly CommitLanePassThroughIssue[] {
    const issues: CommitLanePassThroughIssue[] = [];
    rows.forEach((row, rowIndex) => {
        const lane = row.laneData.lane;
        for (const line of row.laneData.lines) {
            if (line.startY !== 'top' || line.endY !== 'bottom' || line.fromLane !== lane || line.toLane !== lane) { continue; }
            issues.push({ rowIndex, hash: row.commit.hash, lane, targetHash: line.targetHash });
        }
    });
    return issues;
}

export function findAdjacentDisconnectedSameLaneIssues(rows: readonly GraphRow[]): readonly AdjacentDisconnectedSameLaneIssue[] {
    const issues: AdjacentDisconnectedSameLaneIssue[] = [];
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
        const row = rows[rowIndex]!;
        const nextRow = rows[rowIndex + 1]!;
        const lane = row.laneData.lane;
        if (lane !== nextRow.laneData.lane) { continue; }
        if (hasBottomConnectionToNext(row, nextRow.commit.hash, lane) && hasTopConnectionFromPrevious(nextRow, lane)) { continue; }
        issues.push({ rowIndex, hash: row.commit.hash, nextHash: nextRow.commit.hash, lane });
    }
    return issues;
}

function hasBottomConnectionToNext(row: GraphRow, nextHash: string, lane: number): boolean {
    return row.laneData.lines.some((line) => line.startY === 'center'
        && line.endY === 'bottom'
        && line.fromLane === lane
        && line.toLane === lane
        && line.targetHash === nextHash);
}

function hasTopConnectionFromPrevious(row: GraphRow, lane: number): boolean {
    return row.laneData.lines.some((line) => line.startY === 'top'
        && line.endY === 'center'
        && line.fromLane === lane
        && line.toLane === lane
        && line.targetHash === row.commit.hash);
}

function touchesIncomingCenter(line: LineDef, lane: number): boolean {
    return (line.endY === 'center' && line.toLane === lane) || isStraightThroughCenter(line, lane);
}

function touchesOutgoingCenter(line: LineDef, lane: number): boolean {
    return (line.startY === 'center' && line.fromLane === lane) || isStraightThroughCenter(line, lane);
}

function isStraightThroughCenter(line: LineDef, lane: number): boolean {
    return line.type === 'straight'
        && line.fromLane === lane
        && line.toLane === lane
        && line.startY === 'top'
        && line.endY === 'bottom';
}
