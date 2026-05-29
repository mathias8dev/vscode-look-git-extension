// GraphRow, LaneData, LineDef are defined in protocol (single source of truth).
// GraphLaneAssigner imports them — importing pure TS types from protocol is allowed
// since protocol contains no logic, no VS Code API, no React.
import type { GraphRow, LaneData, LineDef } from '../../protocol/graph/types';
import type { GitGraphCommit } from '../git/domain/GitCommit';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

export interface AssignLaneOptions {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
}

// Re-export so consumers don't need to know where rendering types come from.
export type { GraphRow, LaneData, LineDef };

/**
 * Assigns lanes and colors to a list of commits for graph rendering.
 * Input: GitGraphCommit[] (core, from parsing).
 * Output: GraphRow[] (protocol, sent to webview as-is — no mapping needed).
 *
 * TypeScript structural typing makes GitGraphCommit satisfy GraphCommit:
 * both have the same fields, so no explicit cast is required.
 */
export function assignLanes(commits: readonly GitGraphCommit[], options: AssignLaneOptions = {}): GraphRow[] {
    const lanes: (string | null)[] = [];
    const result: GraphRow[] = [];
    const primaryTipIndex = commits.findIndex((c) => isPrimaryTip(c, options));
    const hasPrimaryTip = primaryTipIndex !== -1;
    let primaryPending = hasPrimaryTip;
    let primarySeen = false;

    function findLane(hash: string): number {
        for (let i = 0; i < lanes.length; i++) { if (lanes[i] === hash) { return i; } }
        return -1;
    }

    function findFreeLane(): number {
        const start = primaryPending ? 1 : 0;
        if (primaryPending && lanes.length === 0) { lanes.push(null); }
        for (let i = start; i < lanes.length; i++) { if (lanes[i] === null) { return i; } }
        return lanes.length;
    }

    function ensureLane(lane: number): void {
        while (lane >= lanes.length) { lanes.push(null); }
    }

    function laneColor(lane: number): string {
        return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
    }

    for (const commit of commits) {
        const lines: LineDef[] = [];
        const isPrimaryTipCommit = hasPrimaryTip && isPrimaryTip(commit, options);
        let lane = isPrimaryTipCommit ? 0 : findLane(commit.hash);

        if (lane === -1) { lane = findFreeLane(); ensureLane(lane); }
        else { ensureLane(lane); }

        if (isPrimaryTipCommit) { primaryPending = false; primarySeen = true; ensureLane(0); }

        const color = laneColor(lane);
        const isPrimaryLane = hasPrimaryTip && primarySeen && lane === 0;

        lanes[lane] = null;

        const parents = commit.parentHashes as string[];
        const firstParent = parents[0];
        const firstParentLane = firstParent ? findLane(firstParent) : -1;
        let primaryOverrideFromLane: number | undefined;

        if (isPrimaryLane && firstParentLane !== -1 && firstParentLane !== lane) {
            primaryOverrideFromLane = firstParentLane;
            lanes[firstParentLane] = null;
        }

        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] !== null && i !== lane) {
                lines.push({ fromLane: i, toLane: i, color: laneColor(i), type: 'straight', targetHash: lanes[i] ?? undefined, role: 'pass-through' });
            }
        }

        if (primaryOverrideFromLane !== undefined) {
            lines.push({
                fromLane: primaryOverrideFromLane, toLane: lane, color: laneColor(primaryOverrideFromLane),
                type: lane < primaryOverrideFromLane ? 'merge-left' : 'merge-right',
                targetHash: firstParent, role: 'merge-parent', fromTop: true,
            });
        }

        if (parents.length > 0 && firstParent) {
            const existingLane = findLane(firstParent);
            if (existingLane !== -1 && existingLane !== lane && !isPrimaryLane) {
                lines.push({
                    fromLane: lane, toLane: existingLane, color: laneColor(existingLane),
                    type: existingLane < lane ? 'merge-left' : 'merge-right',
                    targetHash: firstParent, role: 'first-parent', fromTop: true,
                });
                lanes[lane] = null;
            } else if (existingLane === -1) {
                lanes[lane] = firstParent;
                lines.push({ fromLane: lane, toLane: lane, color, type: 'straight', targetHash: firstParent, role: 'first-parent' });
            } else {
                lanes[lane] = firstParent;
                lines.push({ fromLane: lane, toLane: lane, color, type: 'straight', targetHash: firstParent, role: 'first-parent' });
            }

            for (let p = 1; p < parents.length; p++) {
                const parentHash = parents[p];
                if (!parentHash) { continue; }
                const parentLane = findLane(parentHash);
                if (parentLane !== -1) {
                    lines.push({
                        fromLane: lane, toLane: parentLane, color: laneColor(parentLane),
                        type: parentLane < lane ? 'merge-left' : 'merge-right',
                        targetHash: parentHash, role: 'merge-parent',
                    });
                } else {
                    const newLane = findFreeLane();
                    ensureLane(newLane);
                    lanes[newLane] = parentHash;
                    lines.push({
                        fromLane: lane, toLane: newLane, color: laneColor(newLane),
                        type: newLane < lane ? 'fork-left' : 'fork-right',
                        targetHash: parentHash, role: 'merge-parent',
                    });
                }
            }
        }

        const laneData: LaneData = { lane, color, lines, isPrimary: isPrimaryLane };
        result.push({ commit, laneData });
    }

    return result;
}

export function getMaxLane(rows: readonly GraphRow[]): number {
    let max = 0;
    for (const row of rows) {
        if (row.laneData.lane > max) { max = row.laneData.lane; }
        for (const line of row.laneData.lines) {
            if (line.fromLane > max) { max = line.fromLane; }
            if (line.toLane > max) { max = line.toLane; }
        }
    }
    return max;
}

function isPrimaryTip(commit: GitGraphCommit, options: AssignLaneOptions): boolean {
    if (options.primaryBranchHash) {
        const h = options.primaryBranchHash;
        if (commit.hash.startsWith(h) || commit.shortHash === h) { return true; }
    }
    if (!options.primaryBranch) { return false; }
    return commit.refs.some((ref) => normalizeRef(ref) === options.primaryBranch);
}

function normalizeRef(ref: string): string {
    if (ref.startsWith('HEAD -> ')) { return ref.replace('HEAD -> ', ''); }
    if (ref.startsWith('tag: ')) { return ref.replace('tag: ', ''); }
    return ref;
}
