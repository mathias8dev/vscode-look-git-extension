import type { GraphCommit } from '../../../../protocol/graph/types';
import type { GraphRow, LaneData, LineDef } from './graph-lane-model';

const LANE_COLORS = [
    '#f97583', '#79b8ff', '#85e89d', '#ffab70', '#b392f0',
    '#f692ce', '#73daca', '#ffd700', '#9ecbff', '#c8d6e5',
];

const DEFAULT_CHECKPOINT_INTERVAL = 300;
const DEFAULT_HIDDEN_BOUNDARY_LANE_LIMIT = 16;

export interface GraphLayoutOptionsV3 {
    readonly primaryBranch?: string;
    readonly primaryBranchHash?: string;
    readonly showHiddenParentBoundaryEdges?: boolean;
    readonly previous?: GraphLayoutStateV3;
    readonly checkpointInterval?: number;
    readonly hiddenBoundaryLaneLimit?: number;
}

export interface GraphLayoutStateV3 {
    readonly rows: readonly GraphRow[];
    readonly activeLanes: readonly GraphActiveLaneV3[];
    readonly laneByCommitHash: ReadonlyMap<string, number>;
    readonly checkpoints: readonly GraphLayoutCheckpointV3[];
}

export interface GraphLayoutCheckpointV3 {
    readonly rowCount: number;
    readonly lastHash: string;
    readonly activeLanes: readonly GraphActiveLaneV3[];
}

export interface GraphActiveLaneV3 {
    readonly targetHash: string;
    readonly lane: number;
    readonly homeLane: number;
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

interface LayoutSeed {
    readonly rows: readonly GraphRow[];
    readonly activeLanes: readonly GraphActiveLaneV3[];
    readonly laneByCommitHash: ReadonlyMap<string, number>;
    readonly startIndex: number;
}

interface ColumnUpdate {
    readonly newColumns: readonly GraphActiveLaneV3[];
    readonly mappings: readonly ColumnMapping[];
}

interface ColumnMapping {
    readonly fromLane: number;
    readonly toLane: number;
    readonly targetHash: string;
    readonly color: string;
    readonly role: 'pass-through' | 'first-parent' | 'merge-parent';
    readonly source: 'column' | 'parent';
    readonly parentIndex?: number;
    readonly hidden: boolean;
}

export function layoutGraphRowsV3(commits: readonly GraphCommit[], options: GraphLayoutOptionsV3 = {}): GraphLayoutStateV3 {
    const visibleHashes = new Set(commits.map((commit) => commit.hash));
    const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
    const seed = seedFromPrevious(commits, options);
    const rows: GraphRow[] = [...seed.rows];
    const laneByCommitHash = new Map(seed.laneByCommitHash);
    const primaryHash = commits.find((commit) => isPrimaryTip(commit, options))?.hash;
    const primaryChain = primaryHash ? firstParentChain(primaryHash, commitByHash) : new Set<string>();
    let active = normalizeActiveLanes(seed.activeLanes);
    let previousDisconnectedLane: number | undefined;

    for (const commit of commits.slice(seed.startIndex)) {
        const input = normalizeActiveLanes(active);
        const activeIndex = input.findIndex((lane) => lane.targetHash === commit.hash);
        const parentEdges = keptParentEdges(commit, visibleHashes, input, options);
        const lane = laneByCommitHash.get(commit.hash)
            ?? (activeIndex !== -1 ? input[activeIndex]!.lane : newCommitLane(input, previousDisconnectedLane, options));
        const update = updateColumns(input, commit.hash, lane, parentEdges);
        const lines = rowLines(commit, lane, input, update, visibleHashes);
        const color = colorForCommitLane(lane, input, update.newColumns);
        const laneData: LaneData = {
            lane,
            color,
            lines,
            isPrimary: primaryChain.has(commit.hash),
        };

        rows.push({ commit, laneData });
        laneByCommitHash.set(commit.hash, lane);
        active = update.newColumns;
        previousDisconnectedLane = hasOwnLaneBottomConnection(laneData) ? undefined : lane;
    }

    return {
        rows,
        activeLanes: active,
        laneByCommitHash,
        checkpoints: buildCheckpoints(rows, options.checkpointInterval),
    };
}

function keptParentEdges(
    commit: GraphCommit,
    visibleHashes: ReadonlySet<string>,
    active: readonly GraphActiveLaneV3[],
    options: GraphLayoutOptionsV3,
): readonly ParentEdge[] {
    const edges: ParentEdge[] = [];
    let hiddenCount = active.filter((lane) => lane.hidden).length;
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

function updateColumns(
    input: readonly GraphActiveLaneV3[],
    commitHash: string,
    lane: number,
    parentEdges: readonly ParentEdge[],
): ColumnUpdate {
    const newColumns: GraphActiveLaneV3[] = [];
    const mappings: ColumnMapping[] = [];
    let seenCommit = false;

    for (const column of input) {
        if (column.targetHash === commitHash) {
            seenCommit = true;
            insertParentsIntoNewColumns(newColumns, mappings, lane, parentEdges);
            continue;
        }
        insertColumnIntoNewColumns(newColumns, mappings, column, column.lane);
    }

    if (!seenCommit) {
        insertParentsIntoNewColumns(newColumns, mappings, lane, parentEdges);
    }

    return { newColumns: normalizeActiveLanes(newColumns), mappings };
}

function rowLines(
    commit: GraphCommit,
    lane: number,
    input: readonly GraphActiveLaneV3[],
    update: ColumnUpdate,
    visibleHashes: ReadonlySet<string>,
): readonly LineDef[] {
    const lines: LineDef[] = [];

    for (const column of input) {
        if (column.targetHash === commit.hash) {
            lines.push({
                fromLane: column.lane,
                toLane: lane,
                color: column.color,
                type: lineType(column.lane, lane, 'merge'),
                targetHash: commit.hash,
                role: 'pass-through',
                startY: 'top',
                endY: 'center',
            });
            continue;
        }
    }

    for (const mapping of update.mappings) {
        const targetHash = visibleHashes.has(mapping.targetHash) ? mapping.targetHash : undefined;
        const hiddenTargetHash = targetHash ? undefined : mapping.targetHash;
        if (mapping.source === 'column') {
            lines.push({
                fromLane: mapping.fromLane,
                toLane: mapping.toLane,
                color: mapping.color,
                type: lineType(mapping.fromLane, mapping.toLane, 'merge'),
                ...(targetHash ? { targetHash } : {}),
                ...(hiddenTargetHash ? { hiddenTargetHash } : {}),
                role: 'pass-through',
                startY: 'top',
                endY: 'bottom',
            });
            continue;
        }
        lines.push({
            fromLane: lane,
            toLane: mapping.toLane,
            color: mapping.color,
            type: lineType(lane, mapping.toLane, mapping.parentIndex === 0 ? 'merge' : 'fork'),
            ...(targetHash ? { targetHash } : {}),
            ...(hiddenTargetHash ? { hiddenTargetHash } : {}),
            role: mapping.role,
            startY: 'center',
            endY: 'bottom',
        });
    }

    return lines;
}

function insertParentsIntoNewColumns(
    newColumns: GraphActiveLaneV3[],
    mappings: ColumnMapping[],
    lane: number,
    parentEdges: readonly ParentEdge[],
): void {
    for (const edge of parentEdges) {
        const preferredLane = edge.parentIndex === 1 && parentEdges.length === 2
            ? Math.max(lane + 3, nextLaneAfter(newColumns))
            : nextLaneAfter(newColumns);
        const parentLane = insertCommitIntoNewColumns(newColumns, edge.parentHash, preferredLane, {
            color: edge.parentIndex === 0 ? laneColor(lane) : laneColor(preferredLane),
            role: edge.role,
            hidden: edge.hidden,
        });
        const column = newColumns.find((candidate) => candidate.lane === parentLane);
        if (!column) { continue; }
        mappings.push({
            fromLane: lane,
            toLane: parentLane,
            targetHash: edge.parentHash,
            color: column.color,
            role: edge.role,
            source: 'parent',
            parentIndex: edge.parentIndex,
            hidden: edge.hidden,
        });
    }
}

function insertColumnIntoNewColumns(
    newColumns: GraphActiveLaneV3[],
    mappings: ColumnMapping[],
    column: GraphActiveLaneV3,
    preferredLane: number,
): void {
    const toLane = insertCommitIntoNewColumns(newColumns, column.targetHash, preferredLane, column);
    mappings.push({
        fromLane: column.lane,
        toLane,
        targetHash: column.targetHash,
        color: column.color,
        role: 'pass-through',
        source: 'column',
        hidden: column.hidden,
    });
}

function insertCommitIntoNewColumns(
    newColumns: GraphActiveLaneV3[],
    targetHash: string,
    preferredLane: number,
    column: Omit<GraphActiveLaneV3, 'targetHash' | 'lane' | 'homeLane'> | GraphActiveLaneV3,
): number {
    const existing = newColumns.find((candidate) => candidate.targetHash === targetHash);
    if (existing) { return existing.lane; }
    const lane = freeOutputLane(newColumns, preferredLane);
    newColumns.push({
        targetHash,
        lane,
        homeLane: lane,
        color: column.color,
        role: column.role,
        hidden: column.hidden,
    });
    return lane;
}

function newCommitLane(
    active: readonly GraphActiveLaneV3[],
    previousDisconnectedLane: number | undefined,
    options: GraphLayoutOptionsV3,
): number {
    const lane = nextLaneAfter(active);
    const maxLane = options.showHiddenParentBoundaryEdges
        ? Math.max(0, Math.floor(options.hiddenBoundaryLaneLimit ?? DEFAULT_HIDDEN_BOUNDARY_LANE_LIMIT))
        : undefined;
    if (maxLane !== undefined && lane >= maxLane) { return maxLane; }
    return lane === previousDisconnectedLane ? lane + 1 : lane;
}

function colorForCommitLane(
    lane: number,
    input: readonly GraphActiveLaneV3[],
    output: readonly GraphActiveLaneV3[],
): string {
    return input.find((column) => column.lane === lane)?.color
        ?? output.find((column) => column.lane === lane)?.color
        ?? laneColor(lane);
}

function nextLaneAfter(activeLanes: readonly GraphActiveLaneV3[]): number {
    return activeLanes.reduce((max, activeLane) => Math.max(max, activeLane.lane + 1), 0);
}

function seedFromPrevious(
    commits: readonly GraphCommit[],
    options: GraphLayoutOptionsV3,
): LayoutSeed {
    const previous = options.previous;
    if (!previous || previous.rows.length === 0) {
        return { rows: [], activeLanes: [], laneByCommitHash: new Map(), startIndex: 0 };
    }

    const prefixLength = commonPrefixLength(previous.rows, commits);
    if (prefixLength === 0) {
        return { rows: [], activeLanes: [], laneByCommitHash: new Map(), startIndex: 0 };
    }

    return {
        rows: [],
        activeLanes: [],
        laneByCommitHash: laneMapForRows(previous.laneByCommitHash, previous.rows.slice(0, prefixLength)),
        startIndex: 0,
    };
}

function commonPrefixLength(rows: readonly GraphRow[], commits: readonly GraphCommit[]): number {
    const length = Math.min(rows.length, commits.length);
    for (let index = 0; index < length; index++) {
        if (rows[index]?.commit.hash !== commits[index]?.hash) { return index; }
    }
    return length;
}

function laneMapForRows(previousLaneByCommitHash: ReadonlyMap<string, number>, rows: readonly GraphRow[]): ReadonlyMap<string, number> {
    const laneByCommitHash = new Map<string, number>();
    for (const row of rows) {
        laneByCommitHash.set(row.commit.hash, previousLaneByCommitHash.get(row.commit.hash) ?? row.laneData.lane);
    }
    return laneByCommitHash;
}

function buildCheckpoints(rows: readonly GraphRow[], checkpointInterval: number | undefined): readonly GraphLayoutCheckpointV3[] {
    const interval = Math.max(1, Math.floor(checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL));
    const checkpoints: GraphLayoutCheckpointV3[] = [];
    let active: readonly GraphActiveLaneV3[] = [];

    rows.forEach((row, index) => {
        active = activeAfterRow(active, row);
        const rowCount = index + 1;
        if (rowCount % interval !== 0 && rowCount !== rows.length) { return; }
        checkpoints.push({
            rowCount,
            lastHash: row.commit.hash,
            activeLanes: active,
        });
    });

    return checkpoints;
}

function activeAfterRow(activeLanes: readonly GraphActiveLaneV3[], row: GraphRow): readonly GraphActiveLaneV3[] {
    const activeByLane = new Map(activeLanes.map((activeLane) => [activeLane.lane, activeLane]));
    const next = new Map<number, GraphActiveLaneV3>();
    for (const line of row.laneData.lines) {
        if (line.endY !== 'bottom') { continue; }
        const source = activeByLane.get(line.fromLane);
        const targetHash = line.targetHash ?? line.hiddenTargetHash ?? source?.targetHash ?? hiddenLaneTarget(line.toLane);
        next.set(line.toLane, {
            targetHash,
            lane: line.toLane,
            homeLane: source?.homeLane ?? line.toLane,
            color: line.color,
            role: line.role,
            hidden: line.targetHash === undefined,
        });
    }
    return normalizeActiveLanes([...next.values()]);
}

function hiddenLaneTarget(lane: number): string {
    return `hidden:${lane}`;
}

function firstFreeLaneAtOrAfter(startLane: number, occupied: ReadonlySet<number>): number {
    for (let lane = Math.max(0, startLane); ; lane++) {
        if (!occupied.has(lane)) { return lane; }
    }
}

function normalizeActiveLanes(activeLanes: readonly GraphActiveLaneV3[]): readonly GraphActiveLaneV3[] {
    return activeLanes
        .slice()
        .sort((left, right) => left.lane - right.lane);
}

function freeOutputLane(output: readonly GraphActiveLaneV3[], preferredLane: number): number {
    const occupied = new Set(output.map((column) => column.lane));
    return firstFreeLaneAtOrAfter(preferredLane, occupied);
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

function isPrimaryTip(commit: GraphCommit, options: GraphLayoutOptionsV3): boolean {
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
