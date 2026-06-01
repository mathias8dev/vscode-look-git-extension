import type { GraphCommit } from '../../../../protocol/graph/types';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

export interface AssignLaneOptions {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
    readonly lockedLanes?: ReadonlyMap<string, number>;
}

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
    readonly role: 'pass-through' | 'first-parent' | 'merge-parent';
    readonly startY: 'top' | 'center';
    readonly endY: 'center' | 'bottom';
}

export function assignLanes(commits: readonly GraphCommit[], options: AssignLaneOptions = {}): GraphRow[] {
    const layout = buildPermanentLayout(commits, options);
    const lanes: (string | null)[] = [];
    const result: GraphRow[] = [];
    const pendingReservedHashes = new Set(layout.reservedLaneByHash.keys());
    let primarySeen = false;

    function findLane(hash: string): number {
        for (let i = 0; i < lanes.length; i++) { if (lanes[i] === hash) { return i; } }
        return -1;
    }

    function findLanes(hash: string): number[] {
        const matches: number[] = [];
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] === hash) { matches.push(i); }
        }
        return matches;
    }

    function chooseIncomingLane(hash: string, incomingLanes: readonly number[]): number {
        const lockedLane = options.lockedLanes?.get(hash);
        if (lockedLane !== undefined && incomingLanes.includes(lockedLane)) { return lockedLane; }
        const reservedLane = layout.reservedLaneByHash.get(hash);
        if (reservedLane !== undefined && incomingLanes.includes(reservedLane)) { return reservedLane; }
        return incomingLanes[0] ?? takeLaneFor(hash);
    }

    function findFreeLane(): number {
        for (let i = 0; ; i++) {
            if (i >= lanes.length || lanes[i] === null) { return i; }
        }
    }

    function takeLaneFor(hash: string): number {
        const reservedLane = layout.reservedLaneByHash.get(hash);
        if (reservedLane !== undefined && pendingReservedHashes.has(hash)) {
            ensureLane(reservedLane);
            if (lanes[reservedLane] === null) {
                pendingReservedHashes.delete(hash);
                return reservedLane;
            }
        }
        return findFreeLane();
    }

    function ensureLane(lane: number): void {
        while (lane >= lanes.length) { lanes.push(null); }
    }

    function laneColor(lane: number): string {
        return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
    }

    for (const commit of commits) {
        const lines: LineDef[] = [];
        const isPrimaryStartCommit = layout.primaryHash === commit.hash;
        const incomingLanes = isPrimaryStartCommit ? [] : findLanes(commit.hash);
        const hasIncoming = incomingLanes.length > 0;
        let lane = hasIncoming ? chooseIncomingLane(commit.hash, incomingLanes) : -1;

        if (lane === -1) { lane = takeLaneFor(commit.hash); ensureLane(lane); }
        else { ensureLane(lane); }

        if (isPrimaryStartCommit) { primarySeen = true; ensureLane(lane); }

        const color = laneColor(lane);
        const isPrimaryLane = layout.primaryHash !== undefined && primarySeen && lane === layout.primaryLane;

        for (const incoming of incomingLanes) {
            lanes[incoming] = null;
            if (incoming !== lane) {
                lines.push({
                    fromLane: incoming, toLane: lane, color: laneColor(incoming),
                    type: lane < incoming ? 'merge-left' : 'merge-right',
                    targetHash: commit.hash, role: 'pass-through',
                    startY: 'top', endY: 'center',
                });
            }
        }
        lanes[lane] = null;

        const parents = commit.parentHashes;
        const firstParent = parents[0];

        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] !== null && i !== lane) {
                lines.push({
                    fromLane: i, toLane: i, color: laneColor(i), type: 'straight',
                    targetHash: lanes[i] ?? undefined, role: 'pass-through',
                    startY: 'top', endY: 'bottom',
                });
            }
        }

        if (parents.length > 0 && firstParent) {
            lanes[lane] = firstParent;
            lines.push({
                fromLane: lane, toLane: lane, color, type: 'straight',
                targetHash: firstParent, role: 'first-parent',
                startY: hasIncoming ? 'top' : 'center', endY: 'bottom',
            });

            for (let p = 1; p < parents.length; p++) {
                const parentHash = parents[p];
                if (!parentHash) { continue; }
                const parentLane = findLane(parentHash);
                if (parentLane !== -1) {
                    lines.push({
                        fromLane: lane, toLane: parentLane, color: laneColor(parentLane),
                        type: parentLane < lane ? 'merge-left' : 'merge-right',
                        targetHash: parentHash, role: 'merge-parent',
                        startY: 'center', endY: 'bottom',
                    });
                } else {
                    const newLane = takeLaneFor(parentHash);
                    ensureLane(newLane);
                    lanes[newLane] = parentHash;
                    lines.push({
                        fromLane: lane, toLane: newLane, color: laneColor(newLane),
                        type: newLane < lane ? 'fork-left' : 'fork-right',
                        targetHash: parentHash, role: 'merge-parent',
                        startY: 'center', endY: 'bottom',
                    });
                }
            }
        } else if (hasIncoming) {
            lines.push({
                fromLane: lane, toLane: lane, color, type: 'straight',
                targetHash: commit.hash, role: 'pass-through',
                startY: 'top', endY: 'center',
            });
        }

        const laneData: LaneData = { lane, color, lines, isPrimary: isPrimaryLane };
        result.push({ commit, laneData });
    }

    return result;
}

interface PermanentLayout {
    readonly reservedLaneByHash: ReadonlyMap<string, number>;
    readonly primaryHash: string | undefined;
    readonly primaryLane: number;
}

interface LayoutInterval {
    readonly hash: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly firstParentLength: number;
}

function buildPermanentLayout(commits: readonly GraphCommit[], options: AssignLaneOptions): PermanentLayout {
    const byHash = new Map<string, GraphCommit>();
    const indexByHash = new Map<string, number>();
    const visibleChildCount = new Map<string, number>();
    const candidateStartByHash = new Map<string, number>();

    commits.forEach((commit, index) => {
        byHash.set(commit.hash, commit);
        indexByHash.set(commit.hash, index);
        visibleChildCount.set(commit.hash, 0);
    });

    commits.forEach((commit, index) => {
        commit.parentHashes.forEach((parentHash, parentIndex) => {
            if (!byHash.has(parentHash)) { return; }
            visibleChildCount.set(parentHash, (visibleChildCount.get(parentHash) ?? 0) + 1);
            if (parentIndex > 0) {
                const previous = candidateStartByHash.get(parentHash);
                candidateStartByHash.set(parentHash, previous === undefined ? index : Math.min(previous, index));
            }
        });
    });

    for (const commit of commits) {
        if ((visibleChildCount.get(commit.hash) ?? 0) === 0) {
            candidateStartByHash.set(commit.hash, indexByHash.get(commit.hash) ?? 0);
        }
    }

    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    if (primaryHash) { candidateStartByHash.set(primaryHash, indexByHash.get(primaryHash) ?? 0); }

    const lengthMemo = new Map<string, number>();
    const firstParentLength = (hash: string): number => {
        const memoized = lengthMemo.get(hash);
        if (memoized !== undefined) { return memoized; }
        const commit = byHash.get(hash);
        const firstParent = commit?.parentHashes[0];
        const length = firstParent && byHash.has(firstParent)
            ? 1 + firstParentLength(firstParent)
            : 1;
        lengthMemo.set(hash, length);
        return length;
    };

    const endIndexMemo = new Map<string, number>();
    const firstParentEndIndex = (hash: string): number => {
        const memoized = endIndexMemo.get(hash);
        if (memoized !== undefined) { return memoized; }
        const commit = byHash.get(hash);
        const firstParent = commit?.parentHashes[0];
        const ownIndex = indexByHash.get(hash) ?? 0;
        const endIndex = firstParent && byHash.has(firstParent)
            ? Math.max(ownIndex, firstParentEndIndex(firstParent))
            : ownIndex;
        endIndexMemo.set(hash, endIndex);
        return endIndex;
    };

    const candidates: LayoutInterval[] = [...candidateStartByHash.entries()].map(([hash, startIndex]) => ({
        hash,
        startIndex,
        endIndex: firstParentEndIndex(hash),
        firstParentLength: firstParentLength(hash),
    })).sort((a, b) => {
        if (a.hash === primaryHash) { return -1; }
        if (b.hash === primaryHash) { return 1; }
        const aLocked = options.lockedLanes?.has(a.hash) ?? false;
        const bLocked = options.lockedLanes?.has(b.hash) ?? false;
        if (aLocked !== bLocked) { return aLocked ? -1 : 1; }
        const lengthDiff = b.firstParentLength - a.firstParentLength;
        if (lengthDiff !== 0) { return lengthDiff; }
        return a.startIndex - b.startIndex;
    });

    const reservedLaneByHash = new Map<string, number>();
    const intervalsByLane: LayoutInterval[][] = [];
    for (const candidate of candidates) {
        const lockedLane = options.lockedLanes?.get(candidate.hash);
        const lane = lockedLane !== undefined && intervalLaneAvailable(intervalsByLane, lockedLane, candidate)
            ? lockedLane
            : firstAvailableIntervalLane(intervalsByLane, candidate);
        const laneIntervals = intervalsByLane[lane] ?? [];
        laneIntervals.push(candidate);
        intervalsByLane[lane] = laneIntervals;
        reservedLaneByHash.set(candidate.hash, lane);
    }

    return {
        reservedLaneByHash,
        primaryHash,
        primaryLane: primaryHash ? reservedLaneByHash.get(primaryHash) ?? 0 : 0,
    };
}

function intervalLaneAvailable(
    intervalsByLane: readonly (readonly LayoutInterval[])[],
    lane: number,
    candidate: LayoutInterval,
): boolean {
    const intervals = intervalsByLane[lane] ?? [];
    return !intervals.some((interval) => intervalsOverlap(interval, candidate));
}

function firstAvailableIntervalLane(intervalsByLane: readonly (readonly LayoutInterval[])[], candidate: LayoutInterval): number {
    for (let lane = 0; lane < intervalsByLane.length; lane++) {
        if (intervalLaneAvailable(intervalsByLane, lane, candidate)) { return lane; }
    }
    return intervalsByLane.length;
}

function intervalsOverlap(a: LayoutInterval, b: LayoutInterval): boolean {
    return a.startIndex <= b.endIndex && b.startIndex <= a.endIndex;
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

function isPrimaryTip(commit: GraphCommit, options: AssignLaneOptions): boolean {
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
