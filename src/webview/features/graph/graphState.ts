import type { GraphExtensionToWebviewMessage } from '../../../protocol/graph/messages';
import type { BranchInfo, CommitFileChange, GraphData, GraphFilters, TagInfo, WorktreeInfo, WorktreeWip } from '../../../protocol/graph/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import { assignLanes, type GraphRow, type LaneData, type LineDef } from './layout/assignGraphLanes';

export type DisplayRow =
    | { readonly kind: 'commit'; readonly row: GraphRow }
    | { readonly kind: 'wip'; readonly wip: WorktreeWip; readonly laneData: LaneData };

export function buildDisplayRows(rows: readonly GraphRow[], wips: readonly WorktreeWip[]): readonly DisplayRow[] {
    const wipsByHead = groupWipsByHead(wips);
    const result: DisplayRow[] = [];
    for (const row of rows) {
        const rowWips = wipsByHead.get(row.commit.hash) ?? [];
        rowWips.forEach((wip, index) => {
            result.push({ kind: 'wip', wip, laneData: wipLaneData(row.laneData, index) });
        });
        if (rowWips.length > 0) {
            result.push({ kind: 'commit', row: connectCommitFromWip(row) });
        } else {
            result.push({ kind: 'commit', row });
        }
    }
    return result;
}

function groupWipsByHead(wips: readonly WorktreeWip[]): ReadonlyMap<string, readonly WorktreeWip[]> {
    const groups = new Map<string, WorktreeWip[]>();
    for (const wip of wips) {
        const group = groups.get(wip.head) ?? [];
        group.push(wip);
        groups.set(wip.head, group);
    }
    return groups;
}

function wipLaneData(laneData: LaneData, index: number): LaneData {
    const line: LineDef = {
        fromLane: laneData.lane,
        toLane: laneData.lane,
        color: laneData.color,
        type: 'straight',
        role: 'pass-through',
        startY: index === 0 ? 'center' : 'top',
        endY: 'bottom',
    };
    return { ...laneData, lines: [line] };
}

function connectCommitFromWip(row: GraphRow): GraphRow {
    const { laneData } = row;
    if (laneData.lines.some((line) => line.fromLane === laneData.lane && line.toLane === laneData.lane && line.startY === 'top')) {
        return row;
    }

    const line: LineDef = {
        fromLane: laneData.lane,
        toLane: laneData.lane,
        color: laneData.color,
        type: 'straight',
        targetHash: row.commit.hash,
        role: 'pass-through',
        startY: 'top',
        endY: 'center',
    };
    return { ...row, laneData: { ...laneData, lines: [line, ...laneData.lines] } };
}

export interface CommitDetails {
    readonly kind: 'commit' | 'worktree';
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: readonly CommitFileChange[];
    readonly path?: string;
    readonly branch?: string;
}

export interface GraphState {
    readonly rows: readonly GraphRow[];
    readonly displayRows: readonly DisplayRow[];
    readonly branches: readonly BranchInfo[];
    readonly tags: readonly TagInfo[];
    readonly worktrees: readonly WorktreeInfo[];
    readonly currentBranch: string;
    readonly currentUser: string;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly filters: GraphFilters;
    readonly selectedBranchFilter: string | undefined;
    readonly loading: boolean;
    readonly error: ProtocolError | undefined;
    readonly selectedHash: string | undefined;
    readonly selectedWorktreePath: string | undefined;
    readonly selectedHashes: readonly string[];
    readonly selectionAnchorHash: string | undefined;
    readonly commitDetails: CommitDetails | undefined;
    readonly detailsLoading: boolean;
    readonly repoId: string | undefined;
    readonly loadingMore: boolean;
}

export type GraphAction =
    | { readonly type: 'message'; readonly message: GraphExtensionToWebviewMessage }
    | { readonly type: 'setFilters'; readonly filters: Partial<GraphFilters> }
    | { readonly type: 'setBranchFilter'; readonly branch: string | undefined }
    | { readonly type: 'selectCommit'; readonly hash: string }
    | { readonly type: 'selectWorktree'; readonly path: string }
    | { readonly type: 'toggleCommitSelection'; readonly hash: string }
    | { readonly type: 'selectCommitRange'; readonly hashes: readonly string[]; readonly focusHash: string }
    | { readonly type: 'clearSelection' }
    | { readonly type: 'clearError' }
    | { readonly type: 'startLoadMore' };

export function createInitialGraphState(): GraphState {
    return {
        rows: [],
        displayRows: [],
        branches: [],
        tags: [],
        worktrees: [],
        currentBranch: '',
        currentUser: '',
        hasMore: false,
        loadedCount: 0,
        filters: {},
        selectedBranchFilter: undefined,
        loading: true,
        error: undefined,
        selectedHash: undefined,
        selectedWorktreePath: undefined,
        selectedHashes: [],
        selectionAnchorHash: undefined,
        commitDetails: undefined,
        detailsLoading: false,
        repoId: undefined,
        loadingMore: false,
    };
}

export function reduceGraphState(state: GraphState, action: GraphAction): GraphState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'setFilters':
            return {
                ...state,
                filters: { ...state.filters, ...action.filters },
                loading: true,
                loadingMore: false,
                loadedCount: 0,
            };
        case 'setBranchFilter':
            return {
                ...state,
                selectedBranchFilter: action.branch,
                filters: {
                    ...state.filters,
                    branches: action.branch ? [action.branch] : undefined,
                },
                loading: true,
                loadingMore: false,
                loadedCount: 0,
            };
        case 'selectCommit':
            return selectCommit(state, action.hash, [action.hash], action.hash);
        case 'selectWorktree':
            return selectWorktree(state, action.path);
        case 'toggleCommitSelection':
            return toggleCommitSelection(state, action.hash);
        case 'selectCommitRange':
            return selectCommit(state, action.focusHash, action.hashes, state.selectionAnchorHash ?? action.focusHash);
        case 'clearSelection':
            return { ...state, selectedHash: undefined, selectedWorktreePath: undefined, selectedHashes: [], selectionAnchorHash: undefined, commitDetails: undefined, detailsLoading: false };
        case 'clearError':
            return { ...state, error: undefined };
        case 'startLoadMore':
            return state.hasMore && !state.loading && !state.loadingMore
                ? { ...state, loadingMore: true }
                : state;
    }
}

function selectCommit(state: GraphState, hash: string, hashes: readonly string[], anchorHash: string): GraphState {
    const nextHashes = Array.from(new Set(hashes));
    return {
        ...state,
        selectedHash: hash,
        selectedWorktreePath: undefined,
        selectedHashes: nextHashes,
        selectionAnchorHash: anchorHash,
        detailsLoading: hash !== state.selectedHash || state.commitDetails === undefined,
        commitDetails: hash === state.selectedHash ? state.commitDetails : undefined,
    };
}

function selectWorktree(state: GraphState, path: string): GraphState {
    return {
        ...state,
        selectedHash: undefined,
        selectedWorktreePath: path,
        selectedHashes: [],
        selectionAnchorHash: undefined,
        detailsLoading: path !== state.selectedWorktreePath || state.commitDetails === undefined,
        commitDetails: path === state.selectedWorktreePath ? state.commitDetails : undefined,
    };
}

function toggleCommitSelection(state: GraphState, hash: string): GraphState {
    const selected = new Set(state.selectedHashes);
    if (selected.has(hash)) {
        selected.delete(hash);
    } else {
        selected.add(hash);
    }
    const selectedHashes = Array.from(selected);
    const selectedHash = selected.has(hash) ? hash : selectedHashes.at(-1);
    if (!selectedHash) {
        return { ...state, selectedHash: undefined, selectedWorktreePath: undefined, selectedHashes, selectionAnchorHash: undefined, commitDetails: undefined, detailsLoading: false };
    }
    return selectCommit(state, selectedHash, selectedHashes, hash);
}

function reduceMessage(state: GraphState, message: GraphExtensionToWebviewMessage): GraphState {
    switch (message.type) {
        case 'graph/dataPush':
            return applyGraphData(state, message.data, message.repoId);
        case 'graph/dataResponse':
            return applyGraphData(state, message.data, state.repoId);
        case 'graph/commitDetailsResponse':
            if (message.hash !== state.selectedHash) { return state; }
            return {
                ...state,
                detailsLoading: false,
                commitDetails: {
                    kind: 'commit',
                    hash: message.hash,
                    fullMessage: message.fullMessage,
                    files: message.files,
                },
            };
        case 'graph/worktreeDetailsResponse':
            if (message.path !== state.selectedWorktreePath) { return state; }
            return {
                ...state,
                detailsLoading: false,
                commitDetails: {
                    kind: 'worktree',
                    hash: message.head,
                    fullMessage: message.branch ?? message.path,
                    files: message.files,
                    path: message.path,
                    branch: message.branch,
                },
            };
        case 'graph/selectCommit':
            return selectCommit(state, message.hash, [message.hash], message.hash);
        case 'graph/selectWorktree':
            return selectWorktree(state, message.path);
        case 'graph/error':
        case 'error':
            return { ...state, loading: false, loadingMore: false, error: message.error };
        case 'repo/contextChanged':
            return { ...createInitialGraphState(), repoId: undefined };
    }
}

function applyGraphData(state: GraphState, data: GraphData, repoId: string | undefined): GraphState {
    const currentBranch = data.currentBranch;
    const rows = assignLanes(data.commits, {
        primaryBranch: currentBranch,
        lockedLanes: state.loadingMore ? lockedLanesForRows(state.rows) : undefined,
    });
    const displayRows = buildDisplayRows(rows, data.worktreeWips ?? []);
    return {
        ...state,
        rows,
        displayRows,
        branches: data.branches,
        tags: data.tags,
        worktrees: data.worktrees,
        currentBranch,
        currentUser: data.currentUser,
        hasMore: data.hasMore,
        loadedCount: data.loadedCount,
        loading: false,
        loadingMore: false,
        error: undefined,
        repoId: repoId ?? state.repoId,
    };
}

function lockedLanesForRows(rows: readonly GraphRow[]): ReadonlyMap<string, number> {
    return new Map(rows.map((row) => [row.commit.hash, row.laneData.lane]));
}
