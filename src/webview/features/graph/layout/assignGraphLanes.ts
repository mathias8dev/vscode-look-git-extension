import type { GraphCommit } from '../../../../protocol/graph/types';
import type { GraphRow, LaneData, LineDef } from './graph-lane-model';
export { getMaxLane, getLaneDataMaxLane } from './graph-lane-model';
export type { GraphRow, LaneData, LineDef } from './graph-lane-model';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

export interface AssignLaneOptions {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
    readonly lockedLanes?: ReadonlyMap<string, number>;
    readonly showHiddenParentBoundaryEdges?: boolean;
    readonly stabilizePassThroughDetours?: boolean;
}

interface ActiveLane {
    readonly hash: string;
    readonly color: string;
    readonly homeLane?: number;
    readonly detourLane?: number;
}

interface LanePlacement extends ActiveLane {
    readonly preferredLane: number;
    readonly sourceLane?: number;
}

export function assignLanes(commits: readonly GraphCommit[], options: AssignLaneOptions = {}): GraphRow[] {
    const visibleHashes = new Set(commits.map((commit) => commit.hash));
    const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
    let active: readonly (ActiveLane | undefined)[] = [];
    const result: GraphRow[] = [];
    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    const primaryChain = primaryHash ? firstParentChain(primaryHash, commitByHash) : new Set<string>();
    let previousDisconnectedLane: number | undefined;

    function findActiveLanes(hash: string): number[] {
        const matches: number[] = [];
        for (let i = 0; i < active.length; i++) {
            if (active[i]?.hash === hash) { matches.push(i); }
        }
        return matches;
    }

    function chooseIncomingLane(hash: string, incomingLanes: readonly number[]): number {
        const lockedLane = options.lockedLanes?.get(hash);
        if (lockedLane !== undefined) { return lockedLane; }
        return Math.min(...incomingLanes);
    }

    function newCommitLane(hash: string, preferredLane?: number): number {
        const lockedLane = options.lockedLanes?.get(hash);
        if (lockedLane !== undefined) { return lockedLane; }
        if (preferredLane !== undefined && active[preferredLane] === undefined && preferredLane !== previousDisconnectedLane) { return preferredLane; }
        return firstFreeActiveLane(previousDisconnectedLane);
    }

    function firstFreeActiveLane(avoidLane?: number): number {
        for (let i = 0; i < active.length; i++) {
            if (active[i] === undefined && i !== avoidLane) { return i; }
        }
        return active.length === avoidLane ? active.length + 1 : active.length;
    }

    function laneColor(lane: number): string {
        return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
    }

    function trimTrailingEmptyLanes(lanes: Array<ActiveLane | undefined>): readonly (ActiveLane | undefined)[] {
        while (lanes.length > 0 && lanes[lanes.length - 1] === undefined) {
            lanes.pop();
        }
        return lanes;
    }

    function activeLaneForPlacement(placement: LanePlacement, assignedLane: number): ActiveLane {
        const homeLane = placement.homeLane ?? assignedLane;
        return {
            hash: placement.hash,
            color: placement.color,
            homeLane,
            detourLane: assignedLane === homeLane ? placement.detourLane : assignedLane,
        };
    }

    for (let index = 0; index < commits.length; index++) {
        const commit = commits[index]!;
        const nextHash = commits[index + 1]?.hash;
        const lines: LineDef[] = [];
        const isPrimaryStartCommit = primaryHash === commit.hash;
        const incomingLanes = findActiveLanes(commit.hash);
        const hasIncoming = incomingLanes.length > 0;
        const lane = hasIncoming ? chooseIncomingLane(commit.hash, incomingLanes) : newCommitLane(commit.hash, isPrimaryStartCommit ? 0 : undefined);
        const incomingColorLane = incomingLanes.includes(lane) ? lane : incomingLanes[0];
        const incomingColor = incomingColorLane === undefined ? undefined : active[incomingColorLane]?.color;
        const color = incomingColor ?? laneColor(lane);
        const consumedIncoming = new Set(incomingLanes);
        const placements: LanePlacement[] = [];
        const parents = commit.parentHashes;
        const firstParent = parents[0];
        const parentEdges: Array<{
            readonly parentHash: string;
            readonly placement: LanePlacement;
            readonly role: 'first-parent' | 'merge-parent';
            readonly color: string;
            readonly wasAllocated: boolean;
        }> = [];

        function findReusableParentPlacement(hash: string): LanePlacement | undefined {
            return placements.find((placement) => placement.hash === hash && (placement.sourceLane === undefined || placement.sourceLane !== lane));
        }

        function preferredLaneOccupied(preferredLane: number): boolean {
            return placements.some((placement) => placement.preferredLane === preferredLane);
        }

        function lockedLaneReservedByActiveHash(preferredLane: number, ownerHash: string): boolean {
            if (preferredLane === lane) { return false; }
            return active.some((slot) => slot !== undefined
                && slot.hash !== ownerHash
                && slot.hash !== commit.hash
                && visibleHashes.has(slot.hash)
                && options.lockedLanes?.get(slot.hash) === preferredLane
                && !findReusableParentPlacement(slot.hash));
        }

        function laneReservedByCurrentCommit(preferredLane: number, ownerHash: string, sourceLane?: number): boolean {
            if (preferredLane !== lane || ownerHash === commit.hash) { return false; }
            if (sourceLane !== undefined) { return true; }
            return !parents.includes(ownerHash);
        }

        function preferredLaneAvailable(preferredLane: number, ownerHash: string, sourceLane?: number): boolean {
            return !preferredLaneOccupied(preferredLane)
                && !lockedLaneReservedByActiveHash(preferredLane, ownerHash)
                && !laneReservedByCurrentCommit(preferredLane, ownerHash, sourceLane);
        }

        function firstFreePreferredLane(ownerHash: string, sourceLane?: number): number {
            for (let i = 0; ; i++) {
                if (preferredLaneAvailable(i, ownerHash, sourceLane)) { return i; }
            }
        }

        function preferredPassThroughLane(slot: ActiveLane, sourceLane: number): number {
            if (preferredLaneAvailable(sourceLane, slot.hash, sourceLane)) { return sourceLane; }
            if (options.stabilizePassThroughDetours) {
                return firstStablePassThroughLane(slot, sourceLane);
            }
            return firstFreePreferredLane(slot.hash, sourceLane);
        }

        function firstStablePassThroughLane(slot: ActiveLane, sourceLane: number): number {
            if (slot.detourLane !== undefined
                && slot.detourLane !== sourceLane
                && preferredLaneAvailable(slot.detourLane, slot.hash, sourceLane)) {
                return slot.detourLane;
            }

            const pivotLane = slot.detourLane ?? sourceLane;
            for (let distance = 1; ; distance++) {
                const rightLane = pivotLane + distance;
                if (preferredLaneAvailable(rightLane, slot.hash, sourceLane)) { return rightLane; }
                const leftLane = pivotLane - distance;
                if (leftLane >= 0 && preferredLaneAvailable(leftLane, slot.hash, sourceLane)) { return leftLane; }
            }
        }

        function ensureParentPlacement(parentHash: string, role: 'first-parent' | 'merge-parent'): { readonly placement: LanePlacement; readonly wasAllocated: boolean } {
            const existing = findReusableParentPlacement(parentHash);
            if (existing) { return { placement: existing, wasAllocated: false }; }

            const lockedLane = options.lockedLanes?.get(parentHash);
            const desiredLane = lockedLane ?? (role === 'first-parent' ? lane : firstFreePreferredLane(parentHash));
            const preferredLane = preferredLaneAvailable(desiredLane, parentHash) ? desiredLane : firstFreePreferredLane(parentHash);
            const placement: LanePlacement = {
                hash: parentHash,
                preferredLane,
                color: role === 'first-parent' ? color : laneColor(preferredLane),
            };
            placements.push(placement);
            return { placement, wasAllocated: true };
        }

        for (const incoming of incomingLanes) {
            lines.push({
                fromLane: incoming,
                toLane: lane,
                color: active[incoming]?.color ?? color,
                type: lineType(incoming, lane, 'merge'),
                targetHash: commit.hash,
                role: 'pass-through',
                startY: 'top',
                endY: 'center',
            });
        }

        // Pin this commit's lane to the parent that occupies the immediately
        // following row, so the two stacked dots connect with a straight
        // segment instead of detouring out to a free lane and back. Otherwise
        // an active corridor or the conventional first-parent heuristic can win
        // the lane and shove the next-row parent aside — it then weaves back,
        // producing a visible same-lane disconnect (most often under pagination
        // locks, where lane contention is higher). Only pin when the parent's
        // locked lane agrees with this lane, so we never fight an explicit lock.
        const spineLockedLane = nextHash === undefined ? undefined : options.lockedLanes?.get(nextHash);
        const spineParentHash = nextHash !== undefined
            && parents.includes(nextHash)
            && visibleHashes.has(nextHash)
            && (spineLockedLane === undefined || spineLockedLane === lane)
            ? nextHash
            : undefined;
        let spinePlacement: LanePlacement | undefined;
        if (spineParentHash !== undefined && !active.some((slot) => slot?.hash === spineParentHash)) {
            // Reserve the lane before the corridors are placed so they route
            // around it; the matching parent edge reuses this placement below.
            spinePlacement = {
                hash: spineParentHash,
                preferredLane: lane,
                color: spineParentHash === firstParent ? color : laneColor(lane),
            };
            placements.push(spinePlacement);
        }

        for (let i = 0; i < active.length; i++) {
            const slot = active[i];
            if (!slot || consumedIncoming.has(i)) { continue; }
            if (spineParentHash !== undefined && slot.hash === spineParentHash && i !== lane && spineLockedLane === lane) {
                // The next row's parent is locked to this lane but its corridor
                // has drifted away under lane contention; pull it back so the
                // stacked dots connect straight. We only do this for a parent
                // locked to this exact lane — an unlocked corridor's position is
                // legitimate and must merge into its lane, not be dragged here.
                spinePlacement = { ...slot, preferredLane: lane, sourceLane: i };
                placements.push(spinePlacement);
                continue;
            }
            const preferredLane = preferredPassThroughLane(slot, i);
            placements.push({ ...slot, preferredLane, sourceLane: i });
        }

        if (parents.length > 0 && firstParent) {
            if (visibleHashes.has(firstParent)) {
                const { placement, wasAllocated } = ensureParentPlacement(firstParent, 'first-parent');
                parentEdges.push({
                    parentHash: firstParent,
                    placement,
                    role: 'first-parent',
                    color,
                    wasAllocated,
                });
            } else if (options.showHiddenParentBoundaryEdges) {
                lines.push({
                    fromLane: lane,
                    toLane: lane,
                    color,
                    type: 'straight',
                    role: 'first-parent',
                    startY: 'center',
                    endY: 'bottom',
                });
            }

            for (let p = 1; p < parents.length; p++) {
                const parentHash = parents[p];
                if (!parentHash || !visibleHashes.has(parentHash)) { continue; }
                const { placement, wasAllocated } = ensureParentPlacement(parentHash, 'merge-parent');
                parentEdges.push({
                    parentHash,
                    placement,
                    role: 'merge-parent',
                    color: placement.color,
                    wasAllocated,
                });
            }
        }

        const assignedLaneByPlacement = new Map<LanePlacement, number>();
        const nextActive: Array<ActiveLane | undefined> = [];
        const occupiedLanes = new Set<number>();

        function assignmentLaneAvailable(candidateLane: number, placement: LanePlacement): boolean {
            return !occupiedLanes.has(candidateLane)
                && !lockedLaneReservedByActiveHash(candidateLane, placement.hash)
                && !laneReservedByCurrentCommit(candidateLane, placement.hash, placement.sourceLane);
        }

        function firstAssignableLane(placement: LanePlacement): number {
            if (options.stabilizePassThroughDetours && placement.sourceLane !== undefined) {
                const pivotLane = placement.detourLane ?? placement.preferredLane;
                if (assignmentLaneAvailable(pivotLane, placement)) { return pivotLane; }
                for (let distance = 1; ; distance++) {
                    const rightLane = pivotLane + distance;
                    if (assignmentLaneAvailable(rightLane, placement)) { return rightLane; }
                    const leftLane = pivotLane - distance;
                    if (leftLane >= 0 && assignmentLaneAvailable(leftLane, placement)) { return leftLane; }
                }
            }
            for (let i = 0; ; i++) {
                if (assignmentLaneAvailable(i, placement)) { return i; }
            }
        }

        if (spinePlacement) {
            occupiedLanes.add(lane);
            assignedLaneByPlacement.set(spinePlacement, lane);
            nextActive[lane] = activeLaneForPlacement(spinePlacement, lane);
        }

        for (const placement of placements.slice().sort((left, right) => left.preferredLane - right.preferredLane)) {
            if (placement === spinePlacement) { continue; }
            const lockedLane = options.lockedLanes?.get(placement.hash);
            const keepPreferredLane = placement.sourceLane === undefined || lockedLane !== undefined;
            const assignedLane = lockedLane !== undefined && assignmentLaneAvailable(lockedLane, placement)
                ? lockedLane
                : keepPreferredLane && assignmentLaneAvailable(placement.preferredLane, placement)
                    ? placement.preferredLane
                    : firstAssignableLane(placement);
            occupiedLanes.add(assignedLane);
            assignedLaneByPlacement.set(placement, assignedLane);
            nextActive[assignedLane] = activeLaneForPlacement(placement, assignedLane);
        }
        active = trimTrailingEmptyLanes(nextActive);

        for (const placement of placements) {
            if (placement.sourceLane === undefined) { continue; }
            const toLane = assignedLaneByPlacement.get(placement);
            if (toLane === undefined) { continue; }
            const fromLane = placement.sourceLane;
            lines.push({
                fromLane,
                toLane,
                color: placement.color,
                type: lineType(fromLane, toLane, 'merge'),
                targetHash: placement.hash,
                role: 'pass-through',
                startY: 'top',
                endY: 'bottom',
            });
        }

        for (const edge of parentEdges) {
            const toLane = assignedLaneByPlacement.get(edge.placement);
            if (toLane === undefined) { continue; }
            lines.push({
                fromLane: lane,
                toLane,
                color: edge.color,
                type: lineType(lane, toLane, edge.wasAllocated ? 'fork' : 'merge'),
                targetHash: edge.parentHash,
                role: edge.role,
                startY: 'center',
                endY: 'bottom',
            });
        }

        if (parents.length === 0 && hasIncoming) {
            if (!lines.some((line) => line.endY === 'center' && line.toLane === lane)) {
                lines.push({
                    fromLane: lane, toLane: lane, color, type: 'straight',
                    targetHash: commit.hash, role: 'pass-through',
                    startY: 'top', endY: 'center',
                });
            }
        }

        const isPrimaryLane = primaryChain.has(commit.hash);
        const laneData: LaneData = { lane, color, lines, isPrimary: isPrimaryLane };
        result.push({ commit, laneData });
        previousDisconnectedLane = hasOwnLaneBottomConnection(laneData) ? undefined : lane;
    }

    return result;
}

function hasOwnLaneBottomConnection(laneData: LaneData): boolean {
    return laneData.lines.some((line) => line.startY === 'center'
        && line.endY === 'bottom'
        && line.fromLane === laneData.lane
        && line.toLane === laneData.lane);
}

function lineType(fromLane: number, toLane: number, moving: 'merge' | 'fork'): LineDef['type'] {
    if (fromLane === toLane) { return 'straight'; }
    if (moving === 'fork') { return toLane < fromLane ? 'fork-left' : 'fork-right'; }
    return toLane < fromLane ? 'merge-left' : 'merge-right';
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
