import type { HistoryExtensionToWebviewMessage } from '../../../protocol/history/messages';
import type { HistoryCommit, HistoryCommitDetails, HistoryData } from '../../../protocol/history/types';
import type { ProtocolError } from '../../../protocol/shared/base';

export interface HistoryState {
    readonly commits: readonly HistoryCommit[];
    readonly selectedHash: string | undefined;
    readonly detailsByHash: Readonly<Record<string, HistoryCommitDetails>>;
    readonly detailsLoadingHash: string | undefined;
    readonly loading: boolean;
    readonly loadingMore: boolean;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly error: ProtocolError | undefined;
}

export type HistoryAction =
    | { readonly type: 'message'; readonly message: HistoryExtensionToWebviewMessage }
    | { readonly type: 'selectCommit'; readonly hash: string }
    | { readonly type: 'startRefresh' }
    | { readonly type: 'startLoadMore' }
    | { readonly type: 'clearError' };

export function createInitialHistoryState(): HistoryState {
    return {
        commits: [],
        selectedHash: undefined,
        detailsByHash: {},
        detailsLoadingHash: undefined,
        loading: true,
        loadingMore: false,
        hasMore: false,
        loadedCount: 0,
        error: undefined,
    };
}

export function reduceHistoryState(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'selectCommit':
            return selectCommit(state, action.hash);
        case 'startRefresh':
            return { ...state, loading: true, loadingMore: false, error: undefined };
        case 'startLoadMore':
            return state.hasMore && !state.loading && !state.loadingMore
                ? { ...state, loadingMore: true, error: undefined }
                : state;
        case 'clearError':
            return { ...state, error: undefined };
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
            return selectCommit(state, message.hash);
        case 'history/error':
        case 'error':
            return { ...state, loading: false, loadingMore: false, detailsLoadingHash: undefined, error: message.error };
        case 'repo/contextChanged':
            return createInitialHistoryState();
    }
}

function selectCommit(state: HistoryState, hash: string): HistoryState {
    return {
        ...state,
        selectedHash: hash,
        detailsLoadingHash: state.detailsByHash[hash] ? undefined : hash,
    };
}

function applyData(state: HistoryState, data: HistoryData): HistoryState {
    const commits = data.page.offset === 0
        ? data.commits
        : appendUniqueCommits(state.commits, data.commits);
    const selectedHash = commits.some((commit) => commit.hash === state.selectedHash)
        ? state.selectedHash
        : undefined;
    return {
        ...state,
        commits,
        selectedHash,
        detailsLoadingHash: selectedHash ? state.detailsLoadingHash : undefined,
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
        detailsByHash: {
            ...state.detailsByHash,
            [details.hash]: details,
        },
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
