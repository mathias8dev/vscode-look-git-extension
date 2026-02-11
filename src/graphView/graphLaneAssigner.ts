import type { GraphCommitInfo } from '../gitService';

const LANE_COLORS = [
    '#f97583', // red
    '#79b8ff', // blue
    '#85e89d', // green
    '#ffab70', // orange
    '#b392f0', // purple
    '#f692ce', // pink
    '#73daca', // teal
    '#ffd700', // gold
    '#9ecbff', // light blue
    '#c8d6e5', // silver
];

export interface LineDef {
    fromLane: number;
    toLane: number;
    color: string;
    type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right';
}

export interface LaneData {
    lane: number;
    color: string;
    lines: LineDef[];
}

export interface GraphRow {
    commit: GraphCommitInfo;
    laneData: LaneData;
}

export function assignLanes(commits: GraphCommitInfo[]): GraphRow[] {
    // lanes[i] holds the commit hash expected next in lane i, or null if free
    const lanes: (string | null)[] = [];
    const result: GraphRow[] = [];

    // Map from commit hash to which lane expects it
    // (a child set this lane to expect this parent)
    function findLane(hash: string): number {
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] === hash) {
                return i;
            }
        }
        return -1;
    }

    function findFreeLane(): number {
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] === null) {
                return i;
            }
        }
        return lanes.length;
    }

    for (const commit of commits) {
        const lines: LineDef[] = [];
        let lane = findLane(commit.hash);

        if (lane === -1) {
            // No lane expects this commit — it's a branch tip; assign a free lane
            lane = findFreeLane();
            if (lane >= lanes.length) {
                lanes.push(null);
            }
        }

        const color = LANE_COLORS[lane % LANE_COLORS.length];

        // This commit occupies this lane now; clear the slot
        lanes[lane] = null;

        // Draw continuation lines for all other active lanes (pass-through lines)
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] !== null && i !== lane) {
                lines.push({
                    fromLane: i,
                    toLane: i,
                    color: LANE_COLORS[i % LANE_COLORS.length],
                    type: 'straight',
                });
            }
        }

        // Handle parents
        const parents = commit.parentHashes;

        if (parents.length > 0) {
            // First parent: continues in the same lane
            const firstParent = parents[0];
            const existingLane = findLane(firstParent);

            if (existingLane !== -1 && existingLane !== lane) {
                // First parent already expected in another lane — merge into it
                const mergeColor = LANE_COLORS[existingLane % LANE_COLORS.length];
                lines.push({
                    fromLane: lane,
                    toLane: existingLane,
                    color: mergeColor,
                    type: existingLane < lane ? 'merge-left' : 'merge-right',
                });
                // Free current lane since the parent continues elsewhere
                lanes[lane] = null;
            } else if (existingLane === -1) {
                // First parent not yet claimed — claim this lane for it
                lanes[lane] = firstParent;
                lines.push({
                    fromLane: lane,
                    toLane: lane,
                    color,
                    type: 'straight',
                });
            } else {
                // existingLane === lane, already in the right spot
                lanes[lane] = firstParent;
                lines.push({
                    fromLane: lane,
                    toLane: lane,
                    color,
                    type: 'straight',
                });
            }

            // Additional parents (merge commits): fork into new/free lanes
            for (let p = 1; p < parents.length; p++) {
                const parentHash = parents[p];
                const parentLane = findLane(parentHash);

                if (parentLane !== -1) {
                    // Parent already expected in a lane — draw merge line to it
                    const mergeColor = LANE_COLORS[parentLane % LANE_COLORS.length];
                    lines.push({
                        fromLane: lane,
                        toLane: parentLane,
                        color: mergeColor,
                        type: parentLane < lane ? 'merge-left' : 'merge-right',
                    });
                } else {
                    // Parent not yet claimed — assign a free lane
                    const newLane = findFreeLane();
                    if (newLane >= lanes.length) {
                        lanes.push(null);
                    }
                    lanes[newLane] = parentHash;
                    const forkColor = LANE_COLORS[newLane % LANE_COLORS.length];
                    lines.push({
                        fromLane: lane,
                        toLane: newLane,
                        color: forkColor,
                        type: newLane < lane ? 'fork-left' : 'fork-right',
                    });
                }
            }
        }

        result.push({
            commit,
            laneData: { lane, color, lines },
        });
    }

    return result;
}

export function getMaxLane(rows: GraphRow[]): number {
    let max = 0;
    for (const row of rows) {
        if (row.laneData.lane > max) {
            max = row.laneData.lane;
        }
        for (const line of row.laneData.lines) {
            if (line.fromLane > max) { max = line.fromLane; }
            if (line.toLane > max) { max = line.toLane; }
        }
    }
    return max;
}
