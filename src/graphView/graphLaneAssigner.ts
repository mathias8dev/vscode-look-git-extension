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
    targetHash?: string;
    role: 'pass-through' | 'first-parent' | 'merge-parent';
    fromTop?: boolean; // true when fromLane had an active straight line above this row
}

export interface LaneData {
    lane: number;
    color: string;
    lines: LineDef[];
    isPrimary: boolean;
}

export interface GraphRow {
    commit: GraphCommitInfo;
    laneData: LaneData;
}

export interface AssignLaneOptions {
    primaryBranch?: string;
    primaryBranchHash?: string;
}

export function assignLanes(commits: GraphCommitInfo[], options: AssignLaneOptions = {}): GraphRow[] {
    // lanes[i] holds the commit hash expected next in lane i, or null if free
    const lanes: (string | null)[] = [];
    const result: GraphRow[] = [];
    const primaryTipIndex = commits.findIndex((commit) => isPrimaryTip(commit, options));
    const hasPrimaryTip = primaryTipIndex !== -1;
    let primaryPending = hasPrimaryTip;
    let primarySeen = false;

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
        const start = primaryPending ? 1 : 0;
        if (primaryPending && lanes.length === 0) {
            lanes.push(null);
        }
        for (let i = start; i < lanes.length; i++) {
            if (lanes[i] === null) {
                return i;
            }
        }
        return lanes.length;
    }

    function ensureLane(lane: number): void {
        while (lane >= lanes.length) {
            lanes.push(null);
        }
    }

    for (const commit of commits) {
        const lines: LineDef[] = [];
        const isPrimaryTipCommit = hasPrimaryTip && isPrimaryTip(commit, options);
        let lane = isPrimaryTipCommit ? 0 : findLane(commit.hash);

        if (lane === -1) {
            // No lane expects this commit — it's a branch tip; assign a free lane
            lane = findFreeLane();
            ensureLane(lane);
        } else {
            ensureLane(lane);
        }

        if (isPrimaryTipCommit) {
            primaryPending = false;
            primarySeen = true;
            ensureLane(0);
        }

        const color = LANE_COLORS[lane % LANE_COLORS.length];
        const isPrimaryLane = hasPrimaryTip && primarySeen && lane === 0;

        // This commit occupies this lane now; clear the slot
        lanes[lane] = null;

        const parents = commit.parentHashes;
        const firstParent = parents[0];
        const firstParentLane = firstParent ? findLane(firstParent) : -1;
        let primaryOverrideFromLane: number | undefined;
        if (isPrimaryLane && firstParentLane !== -1 && firstParentLane !== lane) {
            primaryOverrideFromLane = firstParentLane;
            lanes[firstParentLane] = null;
        }

        // Draw continuation lines for all other active lanes (pass-through lines)
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] !== null && i !== lane) {
                lines.push({
                    fromLane: i,
                    toLane: i,
                    color: LANE_COLORS[i % LANE_COLORS.length],
                    type: 'straight',
                    targetHash: lanes[i] ?? undefined,
                    role: 'pass-through',
                });
            }
        }
        if (primaryOverrideFromLane !== undefined) {
            lines.push({
                fromLane: primaryOverrideFromLane,
                toLane: lane,
                color: LANE_COLORS[primaryOverrideFromLane % LANE_COLORS.length],
                type: lane < primaryOverrideFromLane ? 'merge-left' : 'merge-right',
                targetHash: firstParent,
                role: 'merge-parent',
                fromTop: true,
            });
        }

        // Handle parents
        if (parents.length > 0) {
            // First parent: continues in the same lane
            const existingLane = findLane(firstParent);

            if (existingLane !== -1 && existingLane !== lane && !isPrimaryLane) {
                // First parent already expected in another lane — merge into it
                const mergeColor = LANE_COLORS[existingLane % LANE_COLORS.length];
                lines.push({
                    fromLane: lane,
                    toLane: existingLane,
                    color: mergeColor,
                    type: existingLane < lane ? 'merge-left' : 'merge-right',
                    targetHash: firstParent,
                    role: 'first-parent',
                    fromTop: true,
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
                    targetHash: firstParent,
                    role: 'first-parent',
                });
            } else {
                // existingLane === lane, already in the right spot
                lanes[lane] = firstParent;
                lines.push({
                    fromLane: lane,
                    toLane: lane,
                    color,
                    type: 'straight',
                    targetHash: firstParent,
                    role: 'first-parent',
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
                        targetHash: parentHash,
                        role: 'merge-parent',
                    });
                } else {
                    // Parent not yet claimed — assign a free lane
                    const newLane = findFreeLane();
                    ensureLane(newLane);
                    lanes[newLane] = parentHash;
                    const forkColor = LANE_COLORS[newLane % LANE_COLORS.length];
                    lines.push({
                        fromLane: lane,
                        toLane: newLane,
                        color: forkColor,
                        type: newLane < lane ? 'fork-left' : 'fork-right',
                        targetHash: parentHash,
                        role: 'merge-parent',
                    });
                }
            }
        }

        result.push({
            commit,
            laneData: { lane, color, lines, isPrimary: isPrimaryLane },
        });
    }

    return result;
}

function isPrimaryTip(commit: GraphCommitInfo, options: AssignLaneOptions): boolean {
    if (options.primaryBranchHash) {
        const hash = options.primaryBranchHash;
        if (commit.hash.startsWith(hash) || commit.shortHash === hash) {
            return true;
        }
    }

    if (!options.primaryBranch) {
        return false;
    }

    return commit.refs.some((ref) => normalizeRef(ref) === options.primaryBranch);
}

function normalizeRef(ref: string): string {
    if (ref.startsWith('HEAD -> ')) {
        return ref.replace('HEAD -> ', '');
    }
    if (ref.startsWith('tag: ')) {
        return ref.replace('tag: ', '');
    }
    return ref;
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
