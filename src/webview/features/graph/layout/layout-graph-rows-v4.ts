import type { GraphCommit } from '@protocol/graph/types';
import type { GraphRow, LaneData, LineDef } from '@webview/features/graph/layout/graph-lane-model';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

const DEFAULT_HIDDEN_BOUNDARY_LANE_LIMIT = 16;

export interface GraphLayoutOptionsV4 {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
    readonly showHiddenParentBoundaryEdges?: boolean;
    readonly previous?: GraphLayoutStateV4;
    readonly hiddenBoundaryLaneLimit?: number;
}

export interface GraphLayoutStateV4 {
    readonly rows: readonly GraphRow[];
    readonly activeLanes: readonly GraphActiveLaneV4[];
    readonly laneByCommitHash: ReadonlyMap<string, number>;
}

export interface GraphActiveLaneV4 {
    readonly targetHash: string;
    readonly lane: number;
    readonly color: string;
    readonly role: 'first-parent' | 'merge-parent' | 'pass-through';
    readonly hidden: boolean;
}

interface ParentEdge {
    readonly parentHash: string;
    readonly parentIndex: number;
    readonly role: 'first-parent' | 'merge-parent';
    readonly hidden: boolean;
}

export function layoutGraphRowsV4(commits: readonly GraphCommit[], options: GraphLayoutOptionsV4 = {}): GraphLayoutStateV4 {
    const visibleHashes = new Set(commits.map((commit) => commit.hash));
    const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
    const laneByCommitHash = laneLocksFromPrevious(commits, options.previous);
    const lockedIndexByLane = lockedCommitIndexByLane(commits, laneByCommitHash);
    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    const primaryChain = primaryHash ? firstParentChain(primaryHash, commitByHash) : new Set<string>();
    const rows: GraphRow[] = [];
    let active: readonly GraphActiveLaneV4[] = [];
    let previousDisconnectedLane: number | undefined;

    commits.forEach((commit, rowIndex) => {
        const input = normalizeActiveLanes(active);
        const incoming = input.filter((column) => column.targetHash === commit.hash);
        const reserved = reservedLanesAfter(rowIndex, lockedIndexByLane);
        const lane = laneByCommitHash.get(commit.hash)
            ?? incoming[0]?.lane
            ?? disconnectedCommitLane(input, reserved, previousDisconnectedLane);
        const rowColor = incoming[0]?.color ?? laneColor(lane);
        const lines: LineDef[] = [];

        for (const column of input) {
            if (column.targetHash === commit.hash) {
                lines.push(lineFromColumn(column, lane, 'center', commit.hash));
            } else {
                lines.push(lineFromColumn(column, column.lane, 'bottom'));
            }
        }

        const nextActive: GraphActiveLaneV4[] = input.filter((column) => column.targetHash !== commit.hash);
        const parentEdges = keptParentEdges(commit, visibleHashes, nextActive, options);
        const addedParentTargets = new Set(nextActive.map((column) => column.targetHash));

        for (const edge of parentEdges) {
            const existing = nextActive.find((column) => column.targetHash === edge.parentHash);
            const parentLane = existing?.lane ?? parentLaneForEdge(edge, lane, nextActive, laneByCommitHash, rowIndex, lockedIndexByLane);
            const color = existing?.color ?? laneColor(parentLane);
            const targetHash = visibleHashes.has(edge.parentHash) ? edge.parentHash : undefined;
            const hiddenTargetHash = targetHash ? undefined : edge.parentHash;

            lines.push({
                fromLane: lane,
                toLane: parentLane,
                color,
                type: lineType(lane, parentLane, edge.parentIndex === 0 ? 'merge' : 'fork'),
                ...(targetHash ? { targetHash } : {}),
                ...(hiddenTargetHash ? { hiddenTargetHash } : {}),
                role: edge.role,
                startY: 'center',
                endY: 'bottom',
            });

            if (!existing && !addedParentTargets.has(edge.parentHash)) {
                nextActive.push({
                    targetHash: edge.parentHash,
                    lane: parentLane,
                    color,
                    role: edge.role,
                    hidden: edge.hidden,
                });
                addedParentTargets.add(edge.parentHash);
            }
        }

        const laneData: LaneData = {
            lane,
            color: rowColor,
            lines,
            isPrimary: primaryChain.has(commit.hash),
        };
        rows.push({ commit, laneData });
        laneByCommitHash.set(commit.hash, lane);
        active = normalizeActiveLanes(nextActive);
        previousDisconnectedLane = hasOwnLaneBottomConnection(laneData) ? undefined : lane;
    });

    return {
        rows,
        activeLanes: active,
        laneByCommitHash,
    };
}

function keptParentEdges(
    commit: GraphCommit,
    visibleHashes: ReadonlySet<string>,
    active: readonly GraphActiveLaneV4[],
    options: GraphLayoutOptionsV4,
): readonly ParentEdge[] {
    const edges: ParentEdge[] = [];
    let hiddenCount = active.filter((column) => column.hidden).length;
    const hiddenLimit = Math.max(0, Math.floor(options.hiddenBoundaryLaneLimit ?? DEFAULT_HIDDEN_BOUNDARY_LANE_LIMIT));

    commit.parentHashes.forEach((parentHash, parentIndex) => {
        const hidden = !visibleHashes.has(parentHash);
        if (hidden && (!options.showHiddenParentBoundaryEdges || hiddenCount >= hiddenLimit)) { return; }
        if (hidden) { hiddenCount++; }
        edges.push({
            parentHash,
            parentIndex,
            role: parentIndex === 0 ? 'first-parent' : 'merge-parent',
            hidden,
        });
    });

    return edges;
}

function parentLaneForEdge(
    edge: ParentEdge,
    commitLane: number,
    active: readonly GraphActiveLaneV4[],
    laneByCommitHash: ReadonlyMap<string, number>,
    rowIndex: number,
    lockedIndexByLane: ReadonlyMap<number, number>,
): number {
    const lockedParentLane = laneByCommitHash.get(edge.parentHash);
    const occupied = new Set(active.map((column) => column.lane));
    if (lockedParentLane !== undefined && !occupied.has(lockedParentLane)) { return lockedParentLane; }
    const reserved = reservedLanesAfter(rowIndex, lockedIndexByLane);
    const preferredLane = edge.parentIndex === 0 ? commitLane : nextLaneAfter(active);
    return firstFreeLane(active, reserved, preferredLane);
}

function lineFromColumn(
    column: GraphActiveLaneV4,
    toLane: number,
    endY: 'center' | 'bottom',
    visibleTargetHash?: string,
): LineDef {
    const targetHash = visibleTargetHash ?? (column.hidden ? undefined : column.targetHash);
    const hiddenTargetHash = targetHash ? undefined : column.targetHash;
    return {
        fromLane: column.lane,
        toLane,
        color: column.color,
        type: lineType(column.lane, toLane, 'merge'),
        ...(targetHash ? { targetHash } : {}),
        ...(hiddenTargetHash ? { hiddenTargetHash } : {}),
        role: 'pass-through',
        startY: 'top',
        endY,
    };
}

function laneLocksFromPrevious(
    commits: readonly GraphCommit[],
    previous: GraphLayoutStateV4 | undefined,
): Map<string, number> {
    if (!previous) { return new Map(); }
    const prefixLength = commonPrefixLength(previous.rows, commits);
    return laneMapForRows(previous.laneByCommitHash, previous.rows.slice(0, prefixLength));
}

function commonPrefixLength(rows: readonly GraphRow[], commits: readonly GraphCommit[]): number {
    const length = Math.min(rows.length, commits.length);
    for (let index = 0; index < length; index++) {
        if (rows[index]?.commit.hash !== commits[index]?.hash) { return index; }
    }
    return length;
}

function laneMapForRows(previousLaneByCommitHash: ReadonlyMap<string, number>, rows: readonly GraphRow[]): Map<string, number> {
    const laneByCommitHash = new Map<string, number>();
    for (const row of rows) {
        laneByCommitHash.set(row.commit.hash, previousLaneByCommitHash.get(row.commit.hash) ?? row.laneData.lane);
    }
    return laneByCommitHash;
}

function lockedCommitIndexByLane(
    commits: readonly GraphCommit[],
    laneByCommitHash: ReadonlyMap<string, number>,
): ReadonlyMap<number, number> {
    const result = new Map<number, number>();
    commits.forEach((commit, index) => {
        const lane = laneByCommitHash.get(commit.hash);
        if (lane === undefined) { return; }
        const existing = result.get(lane);
        if (existing === undefined || index > existing) {
            result.set(lane, index);
        }
    });
    return result;
}

function reservedLanesAfter(rowIndex: number, lockedIndexByLane: ReadonlyMap<number, number>): ReadonlySet<number> {
    const reserved = new Set<number>();
    for (const [lane, lockedIndex] of lockedIndexByLane) {
        if (lockedIndex > rowIndex) {
            reserved.add(lane);
        }
    }
    return reserved;
}

function firstFreeLane(
    active: readonly GraphActiveLaneV4[],
    reserved: ReadonlySet<number>,
    startLane = 0,
): number {
    const occupied = new Set(active.map((column) => column.lane));
    for (let lane = Math.max(0, startLane); ; lane++) {
        if (!occupied.has(lane) && !reserved.has(lane)) { return lane; }
    }
}

function disconnectedCommitLane(
    active: readonly GraphActiveLaneV4[],
    reserved: ReadonlySet<number>,
    previousDisconnectedLane: number | undefined,
): number {
    const lane = firstFreeLane(active, reserved);
    return lane === previousDisconnectedLane ? firstFreeLane(active, reserved, lane + 1) : lane;
}

function nextLaneAfter(active: readonly GraphActiveLaneV4[]): number {
    return active.reduce((max, column) => Math.max(max, column.lane + 1), 0);
}

function normalizeActiveLanes(activeLanes: readonly GraphActiveLaneV4[]): readonly GraphActiveLaneV4[] {
    return activeLanes
        .slice()
        .sort((left, right) => left.lane - right.lane);
}

function laneColor(lane: number): string {
    return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
}

function lineType(fromLane: number, toLane: number, moving: 'merge' | 'fork'): LineDef['type'] {
    if (fromLane === toLane) { return 'straight'; }
    if (moving === 'fork') { return toLane < fromLane ? 'fork-left' : 'fork-right'; }
    return toLane < fromLane ? 'merge-left' : 'merge-right';
}

function hasOwnLaneBottomConnection(laneData: LaneData): boolean {
    return laneData.lines.some((line) => line.startY === 'center'
        && line.endY === 'bottom'
        && line.fromLane === laneData.lane
        && line.toLane === laneData.lane);
}

function isPrimaryTip(commit: GraphCommit, options: GraphLayoutOptionsV4): boolean {
    if (options.primaryBranchHash) {
        const h = options.primaryBranchHash;
        if (commit.hash.startsWith(h) || commit.shortHash === h) { return true; }
    }
    if (!options.primaryBranch) { return false; }
    return commit.refs.some((ref) => normalizeRef(ref) === options.primaryBranch);
}

function firstParentChain(primaryHash: string, commitByHash: ReadonlyMap<string, GraphCommit>): ReadonlySet<string> {
    const chain = new Set<string>();
    let hash: string | undefined = primaryHash;
    while (hash && !chain.has(hash)) {
        chain.add(hash);
        hash = commitByHash.get(hash)?.parentHashes[0];
    }
    return chain;
}

function normalizeRef(ref: string): string {
    if (ref.startsWith('HEAD -> ')) { return ref.replace('HEAD -> ', ''); }
    if (ref.startsWith('tag: ')) { return ref.replace('tag: ', ''); }
    return ref;
}
