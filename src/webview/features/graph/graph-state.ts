import { GraphOperationStatus, type GraphExtensionToWebviewMessage, type GraphOperationStatusPush } from '@protocol/graph/messages';
import type { BranchInfo, CommitFileChange, GraphCommit, GraphData, GraphFilters, GraphSubmoduleInfo, TagInfo, WorktreeInfo, WorktreeWip } from '@protocol/graph/types';
import type { ProtocolError } from '@protocol/shared/base';
import type { RepositoryLocator } from '@protocol/shared/repo';
import { mainGraphRepositorySelection, sameRepositoryLocator, submoduleGraphRepositorySelection, type GraphRepositorySelection } from '@webview/features/graph/graph-repository-selection';
import type { GraphRow, LaneData, LineDef } from '@webview/features/graph/layout/graph-lane-model';
import { layoutGraphRowsV4, type GraphLayoutStateV4 } from '@webview/features/graph/layout/layout-graph-rows-v4';

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
    readonly selectedRepository: GraphRepositorySelection;
    readonly repository: RepositoryLocator | undefined;
    readonly rows: readonly GraphRow[];
    readonly layoutState: GraphLayoutStateV4 | undefined;
    readonly displayRows: readonly DisplayRow[];
    readonly branches: readonly BranchInfo[];
    readonly tags: readonly TagInfo[];
    readonly worktrees: readonly WorktreeInfo[];
    readonly submodules: readonly GraphSubmoduleInfo[];
    readonly currentBranch: string;
    readonly currentUser: string;
    readonly hasRemotes: boolean;
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
    readonly refreshVersion: number;
    readonly activeGraphRequestId: string | undefined;
    readonly operationStatus: GraphOperationStatusPush | undefined;
}

export type GraphAction =
    | { readonly type: 'message'; readonly message: GraphExtensionToWebviewMessage }
    | { readonly type: 'setFilters'; readonly filters: Partial<GraphFilters> }
    | { readonly type: 'setBranchFilter'; readonly branch: string | undefined }
    | { readonly type: 'selectMainRepository' }
    | { readonly type: 'selectSubmodule'; readonly submodulePath: string; readonly submoduleLabel: string; readonly repository?: RepositoryLocator }
    | { readonly type: 'selectCommit'; readonly hash: string }
    | { readonly type: 'selectWorktree'; readonly path: string }
    | { readonly type: 'toggleCommitSelection'; readonly hash: string }
    | { readonly type: 'selectCommitRange'; readonly hashes: readonly string[]; readonly focusHash: string }
    | { readonly type: 'clearSelection' }
    | { readonly type: 'clearError' }
    | { readonly type: 'clearOperationStatus'; readonly operationId: string }
    | { readonly type: 'clearFilters' }
    | { readonly type: 'refreshRequested' }
    | { readonly type: 'startLoadMore' };

export function createInitialGraphState(): GraphState {
    return {
        selectedRepository: mainGraphRepositorySelection(),
        repository: undefined,
        rows: [],
        layoutState: undefined,
        displayRows: [],
        branches: [],
        tags: [],
        worktrees: [],
        submodules: [],
        currentBranch: '',
        currentUser: '',
        hasRemotes: false,
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
        refreshVersion: 0,
        activeGraphRequestId: graphRequestId(0, 'replace'),
        operationStatus: undefined,
    };
}

export function reduceGraphState(state: GraphState, action: GraphAction): GraphState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'setFilters':
            return startGraphReload({
                ...state,
                filters: { ...state.filters, ...action.filters },
                loadedCount: 0,
            }, state.refreshVersion + 1);
        case 'setBranchFilter':
            return startGraphReload({
                ...state,
                selectedBranchFilter: action.branch,
                filters: {
                    ...state.filters,
                    branches: action.branch ? [action.branch] : undefined,
                },
                loadedCount: 0,
            }, state.refreshVersion + 1);
        case 'selectMainRepository':
            return startGraphReload(clearGraphContent({
                ...state,
                selectedRepository: mainGraphRepositorySelection(),
                repository: undefined,
                selectedBranchFilter: undefined,
                filters: { ...state.filters, branches: undefined },
                selectedHash: undefined,
                selectedWorktreePath: undefined,
                selectedHashes: [],
                selectionAnchorHash: undefined,
                commitDetails: undefined,
                detailsLoading: false,
            }), state.refreshVersion + 1);
        case 'selectSubmodule':
            return startGraphReload(clearGraphContent({
                ...state,
                selectedRepository: submoduleGraphRepositorySelection(action.submodulePath, action.submoduleLabel),
                repository: action.repository,
                selectedBranchFilter: undefined,
                filters: { ...state.filters, branches: undefined },
                selectedHash: undefined,
                selectedWorktreePath: undefined,
                selectedHashes: [],
                selectionAnchorHash: undefined,
                commitDetails: undefined,
                detailsLoading: false,
            }), state.refreshVersion + 1);
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
        case 'clearOperationStatus':
            return state.operationStatus?.operationId === action.operationId
                ? { ...state, operationStatus: undefined }
                : state;
        case 'clearFilters':
            return startGraphReload({
                ...state,
                filters: {},
                selectedBranchFilter: undefined,
                loadedCount: 0,
            }, state.refreshVersion + 1);
        case 'refreshRequested':
            return startGraphReload(state, state.refreshVersion + 1);
        case 'startLoadMore':
            return state.hasMore && !state.loading && !state.loadingMore
                ? { ...state, loadingMore: true, activeGraphRequestId: graphRequestId(state.refreshVersion, 'more', state.loadedCount) }
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
            return reduceGraphDataPush(state, message.data, message.repoId);
        case 'graph/submodulesPush':
            return reduceGraphSubmodulesPush(state, message.repository, message.submodules, message.repoId);
        case 'graph/branchFilterInvalidated':
            return reduceGraphBranchFilterInvalidated(state, message.branch, message.repository);
        case 'graph/refreshRequested':
            return startGraphReload(state, state.refreshVersion + 1);
        case 'graph/dataResponse':
            if (!isExpectedGraphResponse(state, message.requestId)) { return state; }
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
        case 'graph/operationStatus':
            return reduceGraphOperationStatus(state, message);
        case 'graph/error':
            if (!isExpectedGraphError(state, message.requestId)) { return state; }
            return message.requestId
                ? { ...state, loading: false, loadingMore: false, activeGraphRequestId: undefined, error: message.error }
                : { ...state, error: message.error };
        case 'error':
            return { ...state, loading: false, loadingMore: false, activeGraphRequestId: undefined, error: message.error };
        case 'repo/contextChanged':
            return { ...createInitialGraphState(), repoId: undefined };
        case 'ui/fontSizeChanged':
            return state;
    }
}

function reduceGraphOperationStatus(state: GraphState, message: GraphOperationStatusPush): GraphState {
    if (!matchesSelectedRuntimeRepository(message.repository, state.repository)) { return state; }
    if (message.status !== GraphOperationStatus.Running && state.operationStatus?.operationId && state.operationStatus.operationId !== message.operationId) {
        return state;
    }
    return { ...state, operationStatus: message };
}

function reduceGraphDataPush(state: GraphState, data: GraphData, repoId: string | undefined): GraphState {
    if (state.activeGraphRequestId) { return state; }
    if (!graphDataMatchesSelectedRepository(data, state)) {
        return startGraphReload(state, state.refreshVersion + 1);
    }
    return applyGraphData(state, data, repoId);
}

function reduceGraphSubmodulesPush(
    state: GraphState,
    repository: RepositoryLocator | undefined,
    submodules: readonly GraphSubmoduleInfo[],
    repoId: string | undefined,
): GraphState {
    if (state.activeGraphRequestId) { return state; }
    if (!matchesSelectedRuntimeRepository(repository, state.repository)) { return state; }
    return {
        ...state,
        submodules,
        repoId: repoId ?? state.repoId,
    };
}

function reduceGraphBranchFilterInvalidated(
    state: GraphState,
    branch: string,
    repository: RepositoryLocator | undefined,
): GraphState {
    if (!matchesSelectedRuntimeRepository(repository, state.repository)) { return state; }
    const nextState = state.selectedBranchFilter === branch
        ? {
            ...state,
            selectedBranchFilter: undefined,
            filters: { ...state.filters, branches: undefined },
        }
        : state;
    return startGraphReload(nextState, nextState.refreshVersion + 1);
}

function isExpectedGraphResponse(state: GraphState, requestId: string): boolean {
    return state.activeGraphRequestId === requestId;
}

function isExpectedGraphError(state: GraphState, requestId: string | undefined): boolean {
    if (!requestId) { return true; }
    return state.activeGraphRequestId === requestId;
}

function applyGraphData(state: GraphState, data: GraphData, repoId: string | undefined): GraphState {
    const currentBranch = data.currentBranch;
    const appending = state.loadingMore && graphDataMatchesSelectedRepository(data, state);
    const submodules = appending
        ? state.submodules
        : mergeSubmoduleSummaries(state.submodules, data.submodules);
    if (!appending && graphDataMatchesState(state, data, submodules)) {
        return {
            ...state,
            loading: false,
            loadingMore: false,
            error: undefined,
            repoId: repoId ?? state.repoId,
            repository: data.repository ?? state.repository,
            activeGraphRequestId: undefined,
        };
    }
    const firstLoadedHash = state.rows[0]?.commit.hash;
    const expandedPrefixLoadMore = appending
        && firstLoadedHash !== undefined
        && data.commits.some((commit) => commit.hash === firstLoadedHash);
    const commits = expandedPrefixLoadMore
        ? uniqueGraphCommits(data.commits)
        : appending
            ? [...state.rows.map((row) => row.commit), ...newGraphCommits(state.rows, data.commits)]
            : data.commits;
    const layoutState = layoutGraphRowsV4(commits, {
        primaryBranch: currentBranch,
        primaryBranchHash: currentBranchHash(data.branches),
        showHiddenParentBoundaryEdges: data.hasMore || hasSparseGraphFilters(state.filters),
        previous: appending ? state.layoutState : undefined,
    });
    const rows = layoutState.rows;
    const displayRows = buildDisplayRows(rows, data.worktreeWips ?? []);
    return {
        ...state,
        rows,
        layoutState,
        displayRows,
        branches: data.branches,
        tags: data.tags,
        worktrees: data.worktrees,
        submodules,
        repository: data.repository ?? state.repository,
        currentBranch,
        currentUser: data.currentUser,
        hasRemotes: data.hasRemotes,
        hasMore: data.hasMore,
        loadedCount: Math.max(data.loadedCount, commits.length),
        loading: false,
        loadingMore: false,
        error: undefined,
        repoId: repoId ?? state.repoId,
        activeGraphRequestId: undefined,
    };
}

function startGraphReload(state: GraphState, refreshVersion: number): GraphState {
    return {
        ...state,
        loading: true,
        loadingMore: false,
        activeGraphRequestId: graphRequestId(refreshVersion, 'replace'),
        refreshVersion,
    };
}

function clearGraphContent(state: GraphState): GraphState {
    return {
        ...state,
        rows: [],
        layoutState: undefined,
        displayRows: [],
        branches: [],
        tags: [],
        worktrees: [],
        submodules: [],
        currentBranch: '',
        hasRemotes: false,
        hasMore: false,
        loadedCount: 0,
    };
}

export function graphRequestId(refreshVersion: number, kind: 'replace' | 'more', offset = 0): string {
    return `graph:${kind}:${refreshVersion}:${offset}`;
}

function currentBranchHash(branches: readonly BranchInfo[]): string | undefined {
    return branches.find((branch) => branch.isCurrent && !branch.isRemote)?.hash;
}

function hasSparseGraphFilters(filters: GraphFilters): boolean {
    return Boolean(
        filters.search?.trim()
        || filters.path?.trim()
        || filters.authors?.length
        || filters.dateFrom
        || filters.dateTo,
    );
}

function uniqueGraphCommits(commits: readonly GraphCommit[]): readonly GraphCommit[] {
    const seen = new Set<string>();
    const unique: GraphCommit[] = [];
    for (const commit of commits) {
        if (seen.has(commit.hash)) { continue; }
        seen.add(commit.hash);
        unique.push(commit);
    }
    return unique;
}

function newGraphCommits(rows: readonly GraphRow[], commits: readonly GraphCommit[]): readonly GraphCommit[] {
    const seen = new Set(rows.map((row) => row.commit.hash));
    return commits.filter((commit) => !seen.has(commit.hash));
}

function graphDataMatchesState(state: GraphState, data: GraphData, submodules: readonly GraphSubmoduleInfo[]): boolean {
    return graphDataMatchesSelectedRepository(data, state)
        && state.currentBranch === data.currentBranch
        && state.currentUser === data.currentUser
        && state.hasRemotes === data.hasRemotes
        && state.hasMore === data.hasMore
        && state.loadedCount === data.loadedCount
        && graphCommitsEqual(state.rows.map((row) => row.commit), data.commits)
        && branchesEqual(state.branches, data.branches)
        && tagsEqual(state.tags, data.tags)
        && worktreesEqual(state.worktrees, data.worktrees)
        && worktreeWipsEqual(state.displayRows, data.worktreeWips)
        && submodulesEqual(state.submodules, submodules);
}

function graphDataMatchesSelectedRepository(data: GraphData, state: GraphState): boolean {
    if (!data.repository) { return state.selectedRepository.kind === 'main' && !state.repository; }
    if (state.repository) { return sameRepositoryLocator(data.repository, state.repository); }
    return state.selectedRepository.kind === 'main' && data.repository.kind === 'main';
}

function matchesSelectedRuntimeRepository(repository: RepositoryLocator | undefined, selected: RepositoryLocator | undefined): boolean {
    if (!repository || !selected) { return true; }
    return sameRepositoryLocator(repository, selected);
}

function mergeSubmoduleSummaries(
    previous: readonly GraphSubmoduleInfo[],
    incoming: readonly GraphSubmoduleInfo[],
): readonly GraphSubmoduleInfo[] {
    const previousByPath = new Map(previous.map((submodule) => [submodule.path, submodule]));
    return incoming.map((submodule) => {
        const existing = previousByPath.get(submodule.path);
        if (!existing || existing.name !== submodule.name || existing.status !== submodule.status) { return submodule; }
        if (submodule.branches.length > 0 || submodule.worktrees.length > 0) { return submodule; }
        return existing;
    });
}

function graphCommitsEqual(a: readonly GraphCommit[], b: readonly GraphCommit[]): boolean {
    return arraysEqual(a, b, graphCommitEqual);
}

function graphCommitEqual(a: GraphCommit, b: GraphCommit): boolean {
    return a.hash === b.hash
        && a.shortHash === b.shortHash
        && a.message === b.message
        && a.authorName === b.authorName
        && a.authorEmail === b.authorEmail
        && a.authorDate === b.authorDate
        && a.matchesFilter === b.matchesFilter
        && a.canCherryPick === b.canCherryPick
        && stringArraysEqual(a.parentHashes, b.parentHashes)
        && stringArraysEqual(a.refs, b.refs);
}

function branchesEqual(a: readonly BranchInfo[], b: readonly BranchInfo[]): boolean {
    return arraysEqual(a, b, branchEqual);
}

function branchEqual(a: BranchInfo, b: BranchInfo): boolean {
    return a.name === b.name
        && a.isRemote === b.isRemote
        && a.isCurrent === b.isCurrent
        && a.hash === b.hash
        && a.upstream === b.upstream
        && a.ahead === b.ahead
        && a.behind === b.behind;
}

function tagsEqual(a: readonly TagInfo[], b: readonly TagInfo[]): boolean {
    return arraysEqual(a, b, (left, right) => left.name === right.name && left.hash === right.hash);
}

function worktreesEqual(a: readonly WorktreeInfo[], b: readonly WorktreeInfo[]): boolean {
    return arraysEqual(a, b, worktreeEqual);
}

function worktreeEqual(a: WorktreeInfo, b: WorktreeInfo): boolean {
    return a.path === b.path
        && a.head === b.head
        && a.branch === b.branch
        && a.isMain === b.isMain
        && a.isDetached === b.isDetached
        && a.isLocked === b.isLocked
        && a.lockReason === b.lockReason;
}

function worktreeWipsEqual(displayRows: readonly DisplayRow[], wips: readonly WorktreeWip[]): boolean {
    const currentWips = displayRows
        .filter((displayRow): displayRow is Extract<DisplayRow, { readonly kind: 'wip' }> => displayRow.kind === 'wip')
        .map((displayRow) => displayRow.wip);
    return arraysEqual(currentWips, wips, worktreeWipEqual);
}

function worktreeWipEqual(a: WorktreeWip, b: WorktreeWip): boolean {
    return a.path === b.path
        && a.head === b.head
        && a.branch === b.branch
        && a.staged === b.staged
        && a.unstaged === b.unstaged
        && a.untracked === b.untracked
        && a.conflicts === b.conflicts;
}

function submodulesEqual(a: readonly GraphSubmoduleInfo[], b: readonly GraphSubmoduleInfo[]): boolean {
    return arraysEqual(a, b, submoduleEqual);
}

function submoduleEqual(a: GraphSubmoduleInfo, b: GraphSubmoduleInfo): boolean {
    return a.path === b.path
        && a.name === b.name
        && a.status === b.status
        && branchesEqual(a.branches, b.branches)
        && worktreesEqual(a.worktrees, b.worktrees);
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
    return arraysEqual(a, b, (left, right) => left === right);
}

function arraysEqual<T>(a: readonly T[], b: readonly T[], itemEqual: (left: T, right: T) => boolean): boolean {
    if (a.length !== b.length) { return false; }
    for (let index = 0; index < a.length; index += 1) {
        const left = a[index];
        const right = b[index];
        if (left === undefined || right === undefined || !itemEqual(left, right)) { return false; }
    }
    return true;
}
