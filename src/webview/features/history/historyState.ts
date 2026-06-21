import { OperationStatus } from '@protocol/shared/operation';
import type { HistoryExtensionToWebviewMessage, HistoryOperationStatusPush } from '@protocol/history/messages';
import type { HistoryCommit, HistoryCommitDetails, HistoryData } from '@protocol/history/types';
import type { ProtocolError } from '@protocol/shared/base';

export interface HistoryState {
    readonly commits: readonly HistoryCommit[];
    readonly expandedHashes: readonly string[];
    readonly selectedHashes: readonly string[];
    readonly selectionAnchorHash: string | undefined;
    readonly detailsByHash: Readonly<Record<string, HistoryCommitDetails>>;
    readonly detailsLoadingHash: string | undefined;
    readonly loading: boolean;
    readonly loadingMore: boolean;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly error: ProtocolError | undefined;
    readonly operationStatus: HistoryOperationStatusPush | undefined;
}

export type HistoryAction =
    | { readonly type: 'message'; readonly message: HistoryExtensionToWebviewMessage }
    | { readonly type: 'toggleCommit'; readonly hash: string }
    | { readonly type: 'selectCommit'; readonly hash: string; readonly mode: HistoryCommitSelectionMode; readonly visibleHashes: readonly string[] }
    | { readonly type: 'startLoadingDetails'; readonly hash: string }
    | { readonly type: 'startRefresh' }
    | { readonly type: 'startLoadMore' }
    | { readonly type: 'clearError' }
    | { readonly type: 'clearOperationStatus'; readonly operationId: string };

export function createInitialHistoryState(): HistoryState {
    return {
        commits: [],
        expandedHashes: [],
        selectedHashes: [],
        selectionAnchorHash: undefined,
        detailsByHash: {},
        detailsLoadingHash: undefined,
        loading: true,
        loadingMore: false,
        hasMore: false,
        loadedCount: 0,
        error: undefined,
        operationStatus: undefined,
    };
}

export function reduceHistoryState(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'toggleCommit':
            return toggleCommit(state, action.hash);
        case 'selectCommit':
            return selectCommit(state, action.hash, action.mode, action.visibleHashes);
        case 'startLoadingDetails':
            return { ...state, detailsLoadingHash: action.hash };
        case 'startRefresh':
            return { ...state, loading: true, loadingMore: false, error: undefined };
        case 'startLoadMore':
            return state.hasMore && !state.loading && !state.loadingMore
                ? { ...state, loadingMore: true, error: undefined }
                : state;
        case 'clearError':
            return { ...state, error: undefined };
        case 'clearOperationStatus':
            return state.operationStatus?.operationId === action.operationId
                ? { ...state, operationStatus: undefined }
                : state;
    }
}

function reduceMessage(state: HistoryState, message: HistoryExtensionToWebviewMessage): HistoryState {
    switch (message.type) {
        case 'history/data':
        case 'history/dataResponse':
            return applyData(state, message.data);
        case 'history/commitDetailsResponse':
            return applyCommitDetails(state, message.details);
        case 'history/selectCommit':
            return toggleCommit(selectCommit(state, message.hash, HistoryCommitSelectionMode.Replace, [message.hash]), message.hash);
        case 'history/applyFileViewMode':
            return state;
        case 'history/operationStatus':
            return reduceHistoryOperationStatus(state, message);
        case 'history/error':
        case 'error':
            return { ...state, loading: false, loadingMore: false, detailsLoadingHash: undefined, error: message.error };
        case 'repo/contextChanged':
            return createInitialHistoryState();
        case 'ui/fontSizeChanged':
            return state;
    }
}

function reduceHistoryOperationStatus(state: HistoryState, message: HistoryOperationStatusPush): HistoryState {
    if (message.status !== OperationStatus.Running && state.operationStatus?.operationId && state.operationStatus.operationId !== message.operationId) {
        return state;
    }
    return { ...state, operationStatus: message };
}

function toggleCommit(state: HistoryState, hash: string): HistoryState {
    const isExpanded = state.expandedHashes.includes(hash);
    if (isExpanded) {
        return { ...state, expandedHashes: state.expandedHashes.filter((h) => h !== hash) };
    }
    // Don't set detailsLoadingHash here — the useEffect in HistoryWebview.tsx
    // watches expandedHashes and dispatches startLoadingDetails for uncached commits.
    return { ...state, expandedHashes: [...state.expandedHashes, hash] };
}

export enum HistoryCommitSelectionMode {
    Replace,
    Toggle,
    Range,
}

function selectCommit(
    state: HistoryState,
    hash: string,
    mode: HistoryCommitSelectionMode,
    visibleHashes: readonly string[],
): HistoryState {
    switch (mode) {
        case HistoryCommitSelectionMode.Replace:
            return { ...state, selectedHashes: [hash], selectionAnchorHash: hash };
        case HistoryCommitSelectionMode.Toggle:
            return toggleCommitSelection(state, hash);
        case HistoryCommitSelectionMode.Range:
            return selectCommitRange(state, hash, visibleHashes);
    }
}

function toggleCommitSelection(state: HistoryState, hash: string): HistoryState {
    const selected = new Set(state.selectedHashes);
    if (selected.has(hash)) {
        selected.delete(hash);
    } else {
        selected.add(hash);
    }
    const selectedHashes = Array.from(selected);
    return {
        ...state,
        selectedHashes,
        selectionAnchorHash: selected.has(hash) ? hash : selectedHashes.at(-1),
    };
}

function selectCommitRange(state: HistoryState, hash: string, visibleHashes: readonly string[]): HistoryState {
    const anchor = state.selectionAnchorHash ?? hash;
    const anchorIndex = visibleHashes.indexOf(anchor);
    const focusIndex = visibleHashes.indexOf(hash);
    if (anchorIndex === -1 || focusIndex === -1) {
        return { ...state, selectedHashes: [hash], selectionAnchorHash: hash };
    }
    const start = Math.min(anchorIndex, focusIndex);
    const end = Math.max(anchorIndex, focusIndex);
    return {
        ...state,
        selectedHashes: visibleHashes.slice(start, end + 1),
        selectionAnchorHash: anchor,
    };
}

function applyData(state: HistoryState, data: HistoryData): HistoryState {
    const commits = data.page.offset === 0
        ? data.commits
        : appendUniqueCommits(state.commits, data.commits);
    const commitHashes = new Set(commits.map((c) => c.hash));
    const expandedHashes = state.expandedHashes.filter((h) => commitHashes.has(h));
    const selectedHashes = state.selectedHashes.filter((h) => commitHashes.has(h));
    return {
        ...state,
        commits,
        expandedHashes,
        selectedHashes,
        selectionAnchorHash: selectedHashes.includes(state.selectionAnchorHash ?? '') ? state.selectionAnchorHash : selectedHashes.at(0),
        detailsLoadingHash: expandedHashes.includes(state.detailsLoadingHash ?? '') ? state.detailsLoadingHash : undefined,
        loading: false,
        loadingMore: false,
        hasMore: data.hasMore,
        loadedCount: commits.length,
        error: undefined,
    };
}

function applyCommitDetails(state: HistoryState, details: HistoryCommitDetails): HistoryState {
    return {
        ...state,
        detailsByHash: { ...state.detailsByHash, [details.hash]: details },
        detailsLoadingHash: state.detailsLoadingHash === details.hash ? undefined : state.detailsLoadingHash,
        error: undefined,
    };
}

function appendUniqueCommits(current: readonly HistoryCommit[], next: readonly HistoryCommit[]): readonly HistoryCommit[] {
    const hashes = new Set(current.map((commit) => commit.hash));
    const result = [...current];
    for (const commit of next) {
        if (hashes.has(commit.hash)) { continue; }
        hashes.add(commit.hash);
        result.push(commit);
    }
    return result;
}
