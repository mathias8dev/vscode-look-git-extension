import type { GraphCommit } from '../../../../protocol/graph/types';
import type { GraphRow, LaneData, LineDef } from './graph-lane-model';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

export interface GraphLayoutOptionsV2 {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
    readonly showHiddenParentBoundaryEdges?: boolean;
    readonly previous?: GraphLayoutStateV2;
}

export interface GraphLayoutStateV2 {
    readonly rows: readonly GraphRow[];
    readonly activeLanes: readonly GraphActiveLane[];
    readonly laneByCommitHash: ReadonlyMap<string, number>;
}

export interface GraphActiveLane {
    readonly targetHash: string;
    readonly lane: number;
    readonly homeLane: number;
    readonly color: string;
    readonly role: 'first-parent' | 'merge-parent' | 'pass-through';
}

interface BoundaryHydration {
    readonly rows: GraphRow[];
    readonly activeLanes: readonly GraphActiveLane[];
}

export function layoutGraphRowsV2(commits: readonly GraphCommit[], options: GraphLayoutOptionsV2 = {}): GraphLayoutStateV2 {
    const previousRows = options.previous?.rows ?? [];
    const visibleHashes = new Set([
        ...previousRows.map((row) => row.commit.hash),
        ...commits.map((commit) => commit.hash),
    ]);
    const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
    const previousLaneByCommitHash = options.previous?.laneByCommitHash ?? new Map<string, number>();
    const previousActiveLanes = options.previous?.activeLanes ?? [];
    const hydrated = hydrateBoundaryRows(previousRows, visibleHashes, previousActiveLanes);
    const rows = hydrated.rows;
    const laneByCommitHash = new Map(previousLaneByCommitHash);
    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    const primaryChain = primaryHash ? firstParentChain(primaryHash, commitByHash) : new Set<string>();
    const hiddenActiveLanes = previousActiveLanes.filter((activeLane) => !visibleHashes.has(activeLane.targetHash));
    let active = normalizeActiveLanes([...hydrated.activeLanes, ...hiddenActiveLanes]);

    for (const commit of commits) {
        const lines: LineDef[] = [];
        const parents = commit.parentHashes;
        const input = normalizeActiveLanes(active);
        const inputIndex = input.findIndex((node) => node.targetHash === commit.hash);
        const lane = laneByCommitHash.get(commit.hash) ?? (inputIndex !== -1 ? input[inputIndex]!.lane : nextLaneAfter(input));
        const output: GraphActiveLane[] = [];
        const parentOutputLanes = new Map<number, number>();
        const parentOutputIndexes = new Map<number, number>();
        let firstParentAdded = false;

        if (parents.length > 0) {
            for (const node of input) {
                if (node.targetHash === commit.hash) {
                    if (!firstParentAdded && shouldKeepParent(parents[0]!, visibleHashes, options)) {
                        parentOutputLanes.set(0, node.lane);
                        parentOutputIndexes.set(0, output.length);
                        output.push({
                            targetHash: parents[0]!,
                            lane: node.lane,
                            homeLane: node.lane,
                            color: node.color,
                            role: 'first-parent',
                        });
                        firstParentAdded = true;
                    }
                    continue;
                }
                output.push({ ...node });
            }
        } else {
            for (const node of input) {
                if (node.targetHash !== commit.hash) {
                    output.push({ ...node });
                }
            }
        }

        for (let parentIndex = firstParentAdded ? 1 : 0; parentIndex < parents.length; parentIndex++) {
            const parentHash = parents[parentIndex]!;
            if (!shouldKeepParent(parentHash, visibleHashes, options)) { continue; }
            const lane = nextLaneAfter(output);
            parentOutputLanes.set(parentIndex, lane);
            parentOutputIndexes.set(parentIndex, output.length);
            output.push({
                targetHash: parentHash,
                lane,
                homeLane: lane,
                color: parentIndex === 0 ? laneColor(lane) : laneColor(lane),
                role: parentIndex === 0 ? 'first-parent' : 'merge-parent',
            });
        }

        const color = output.find((node) => node.lane === lane)?.color
            ?? input.find((node) => node.lane === lane)?.color
            ?? laneColor(lane);

        const usedOutputIndexes = new Set(parentOutputIndexes.values());
        for (const node of input) {
            if (node.targetHash === commit.hash) {
                lines.push({
                    fromLane: node.lane,
                    toLane: lane,
                    color: node.color,
                    type: lineType(node.lane, lane, 'merge'),
                    targetHash: commit.hash,
                    role: 'pass-through',
                    startY: 'top',
                    endY: 'center',
                });
                continue;
            }
            const outputNode = findOutputNode(output, node, usedOutputIndexes);
            if (!outputNode) { continue; }
            lines.push({
                fromLane: node.lane,
                toLane: outputNode.lane,
                color: node.color,
                type: lineType(node.lane, outputNode.lane, 'merge'),
                targetHash: visibleHashes.has(node.targetHash) ? node.targetHash : undefined,
                role: 'pass-through',
                startY: 'top',
                endY: 'bottom',
            });
        }

        if (parents[0] && shouldKeepParent(parents[0], visibleHashes, options)) {
            const firstParentLane = parentOutputLanes.get(0) ?? findLastLane(output, parents[0]);
            const targetHash = visibleHashes.has(parents[0]) ? parents[0] : undefined;
            lines.push({
                fromLane: lane,
                toLane: firstParentLane,
                color,
                type: lineType(lane, firstParentLane, 'merge'),
                ...(targetHash ? { targetHash } : {}),
                role: 'first-parent',
                startY: 'center',
                endY: 'bottom',
            });
        }

        for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
            const parentHash = parents[parentIndex]!;
            if (!shouldKeepParent(parentHash, visibleHashes, options)) { continue; }
            const parentLane = parentOutputLanes.get(parentIndex) ?? findLastLane(output, parentHash);
            const targetHash = visibleHashes.has(parentHash) ? parentHash : undefined;
            lines.push({
                fromLane: lane,
                toLane: parentLane,
                color: output.find((node) => node.lane === parentLane)?.color ?? laneColor(parentLane),
                type: lineType(lane, parentLane, 'fork'),
                ...(targetHash ? { targetHash } : {}),
                role: 'merge-parent',
                startY: 'center',
                endY: 'bottom',
            });
        }

        const laneData: LaneData = {
            lane,
            color,
            lines,
            isPrimary: primaryChain.has(commit.hash),
        };
        rows.push({ commit, laneData });
        laneByCommitHash.set(commit.hash, lane);
        active = normalizeActiveLanes(output);
    }

    return {
        rows,
        activeLanes: active,
        laneByCommitHash,
    };
}

function normalizeActiveLanes(activeLanes: readonly GraphActiveLane[]): readonly GraphActiveLane[] {
    const byLane = new Map<number, GraphActiveLane>();
    for (const activeLane of activeLanes) {
        const existing = byLane.get(activeLane.lane);
        if (!existing || (existing.role !== 'first-parent' && activeLane.role === 'first-parent')) {
            byLane.set(activeLane.lane, activeLane);
        }
    }
    return [...byLane.values()].sort((left, right) => left.lane - right.lane);
}

function shouldKeepParent(parentHash: string, visibleHashes: ReadonlySet<string>, options: GraphLayoutOptionsV2): boolean {
    return visibleHashes.has(parentHash) || Boolean(options.showHiddenParentBoundaryEdges);
}

function nextLaneAfter(activeLanes: readonly GraphActiveLane[]): number {
    return activeLanes.reduce((max, activeLane) => Math.max(max, activeLane.lane + 1), 0);
}

function findOutputNode(
    output: readonly GraphActiveLane[],
    input: GraphActiveLane,
    usedOutputIndexes: Set<number>,
): GraphActiveLane | undefined {
    for (let index = 0; index < output.length; index++) {
        if (usedOutputIndexes.has(index)) { continue; }
        const node = output[index]!;
        if (node.targetHash !== input.targetHash) { continue; }
        usedOutputIndexes.add(index);
        return node;
    }
    return undefined;
}

function findLastLane(activeLanes: readonly GraphActiveLane[], targetHash: string): number {
    for (let index = activeLanes.length - 1; index >= 0; index--) {
        const activeLane = activeLanes[index]!;
        if (activeLane.targetHash === targetHash) { return activeLane.lane; }
    }
    return nextLaneAfter(activeLanes);
}

function hydrateBoundaryRows(
    rows: readonly GraphRow[],
    visibleHashes: ReadonlySet<string>,
    activeLanes: readonly GraphActiveLane[],
): BoundaryHydration {
    if (rows.length === 0 || activeLanes.length === 0) {
        return { rows: [...rows], activeLanes: [] };
    }
    const visibleActiveByLane = new Map(
        activeLanes
            .filter((activeLane) => visibleHashes.has(activeLane.targetHash))
            .map((activeLane) => [activeLane.lane, activeLane]),
    );
    if (visibleActiveByLane.size === 0) {
        return { rows: [...rows], activeLanes: [] };
    }
    const activeByTarget = new Map(
        activeLanes
            .filter((activeLane) => visibleHashes.has(activeLane.targetHash))
            .map((activeLane) => [activeLane.targetHash, activeLane]),
    );

    let hydratedActive = new Map<number, GraphActiveLane>();
    const hydratedRows = rows.map((row) => {
        let changed = false;
        const lines = [...row.laneData.lines];

        for (const activeLane of hydratedActive.values()) {
            if (row.commit.hash === activeLane.targetHash) { continue; }
            if (lines.some((line) => line.startY === 'top' && line.fromLane === activeLane.lane)) { continue; }
            const toLane = freeBottomLane(activeLane.lane, lines, visibleHashes, row.laneData.lane);
            changed = true;
            lines.push({
                fromLane: activeLane.lane,
                toLane,
                color: activeLane.color,
                type: lineType(activeLane.lane, toLane, 'merge'),
                targetHash: activeLane.targetHash,
                role: 'pass-through',
                startY: 'top',
                endY: 'bottom',
            });
        }

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]!;
            if (line.targetHash || line.endY !== 'bottom') { continue; }
            const activeLane = visibleActiveByLane.get(line.toLane);
            if (!activeLane) { continue; }
            const toLane = freeBottomLane(line.toLane, lines, visibleHashes);
            changed = true;
            lines[index] = {
                ...line,
                toLane,
                type: lineType(line.fromLane, toLane, line.role === 'merge-parent' ? 'fork' : 'merge'),
                targetHash: activeLane.targetHash,
            };
        }

        const nextHydratedActive = new Map<number, GraphActiveLane>();
        for (const activeLane of hydratedActive.values()) {
            if (row.commit.hash !== activeLane.targetHash) {
                nextHydratedActive.set(activeLane.lane, activeLane);
            }
        }
        for (const line of lines) {
            if (line.endY !== 'bottom' || !line.targetHash || !visibleHashes.has(line.targetHash)) { continue; }
            const sourceActiveLane = activeByTarget.get(line.targetHash);
            const activeLane = sourceActiveLane
                ? { ...sourceActiveLane, lane: line.toLane, color: line.color }
                : {
                targetHash: line.targetHash,
                lane: line.toLane,
                homeLane: line.toLane,
                color: line.color,
                role: 'pass-through' as const,
            };
            nextHydratedActive.set(line.toLane, activeLane);
        }
        hydratedActive = nextHydratedActive;

        return changed
            ? { ...row, laneData: { ...row.laneData, lines } }
            : row;
    });
    return { rows: hydratedRows, activeLanes: normalizeActiveLanes([...hydratedActive.values()]) };
}

function freeBottomLane(
    preferredLane: number,
    lines: readonly LineDef[],
    visibleHashes: ReadonlySet<string>,
    avoidLane?: number,
): number {
    const occupied = new Set<number>();
    for (const line of lines) {
        if (line.endY === 'bottom' && line.targetHash && visibleHashes.has(line.targetHash)) {
            occupied.add(line.toLane);
        }
    }
    if (avoidLane !== undefined) {
        occupied.add(avoidLane);
    }
    return occupied.has(preferredLane) ? firstFreeLaneAtOrAfter(preferredLane + 1, occupied) : preferredLane;
}

function firstFreeLaneAtOrAfter(startLane: number, occupied: ReadonlySet<number>): number {
    for (let lane = Math.max(0, startLane); ; lane++) {
        if (!occupied.has(lane)) { return lane; }
    }
}

function laneColor(lane: number): string {
    return LANE_COLORS[lane % LANE_COLORS.length] ?? '#ffffff';
}

function lineType(fromLane: number, toLane: number, moving: 'merge' | 'fork'): LineDef['type'] {
    if (fromLane === toLane) { return 'straight'; }
    if (moving === 'fork') { return toLane < fromLane ? 'fork-left' : 'fork-right'; }
    return toLane < fromLane ? 'merge-left' : 'merge-right';
}

function isPrimaryTip(commit: GraphCommit, options: GraphLayoutOptionsV2): boolean {
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
