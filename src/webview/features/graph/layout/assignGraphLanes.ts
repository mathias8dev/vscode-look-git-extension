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
    const visibleHashes = new Set(commits.map((commit) => commit.hash));
    const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
    const lanes: (string | null)[] = [];
    const result: GraphRow[] = [];
    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    const primaryLane = primaryHash ? options.lockedLanes?.get(primaryHash) ?? 0 : 0;
    const primaryChain = primaryHash ? firstParentChain(primaryHash, commitByHash) : new Set<string>();

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
        return Math.min(...incomingLanes);
    }

    function findFreeLane(): number {
        for (let i = 0; ; i++) {
            if (i >= lanes.length || lanes[i] === null) { return i; }
        }
    }

    function takeLaneFor(hash: string, preferredLane?: number): number {
        const freeLane = findFreeLane();
        if (preferredLane !== undefined && preferredLane <= freeLane) {
            ensureLane(preferredLane);
            if (lanes[preferredLane] === null) { return preferredLane; }
        }
        const lockedLane = options.lockedLanes?.get(hash);
        if (lockedLane !== undefined && lockedLane <= freeLane) {
            ensureLane(lockedLane);
            if (lanes[lockedLane] === null) { return lockedLane; }
        }
        return freeLane;
    }

    function ensureLane(lane: number): void {
        while (lane >= lanes.length) { lanes.push(null); }
    }

    function laneColor(lane: number): string {
        return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
    }

    for (const commit of commits) {
        const lines: LineDef[] = [];
        const isPrimaryStartCommit = primaryHash === commit.hash;
        const incomingLanes = isPrimaryStartCommit ? [] : findLanes(commit.hash);
        const hasIncoming = incomingLanes.length > 0;
        let lane = hasIncoming ? chooseIncomingLane(commit.hash, incomingLanes) : -1;

        if (lane === -1) { lane = takeLaneFor(commit.hash, isPrimaryStartCommit ? primaryLane : undefined); ensureLane(lane); }
        else { ensureLane(lane); }

        const color = laneColor(lane);
        const isPrimaryLane = primaryChain.has(commit.hash);

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
            const firstParentLane = visibleHashes.has(firstParent) ? findLane(firstParent) : -1;
            if (firstParentLane !== -1 && firstParentLane !== lane) {
                lines.push({
                    fromLane: lane, toLane: firstParentLane, color,
                    type: firstParentLane < lane ? 'merge-left' : 'merge-right',
                    targetHash: firstParent, role: 'first-parent',
                    startY: hasIncoming ? 'top' : 'center', endY: 'bottom',
                });
            } else if (visibleHashes.has(firstParent)) {
                lanes[lane] = firstParent;
                lines.push({
                    fromLane: lane, toLane: lane, color, type: 'straight',
                    targetHash: firstParent, role: 'first-parent',
                    startY: hasIncoming ? 'top' : 'center', endY: 'bottom',
                });
            } else {
                lines.push({
                    fromLane: lane, toLane: lane, color, type: 'straight',
                    targetHash: firstParent, role: 'first-parent',
                    startY: hasIncoming ? 'top' : 'center', endY: 'bottom',
                });
            }

            for (let p = 1; p < parents.length; p++) {
                const parentHash = parents[p];
                if (!parentHash) { continue; }
                if (!visibleHashes.has(parentHash)) { continue; }
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
