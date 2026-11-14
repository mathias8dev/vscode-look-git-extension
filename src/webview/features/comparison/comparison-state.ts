import type { ComparisonChannel, ComparisonRequest, ComparisonResponse } from '@protocol/comparison/messages';
import { ComparisonMode, type ComparisonBranch, type ComparisonCommit, type ComparisonCommitDetails, type ComparisonFiles, type ComparisonPage, type ComparisonSnapshot } from '@protocol/comparison/types';
import type { ProtocolError } from '@protocol/shared/base';

export interface ComparisonSettings {
    readonly baseBranch: string;
    readonly headBranch: string;
    readonly mode: ComparisonMode;
}

export interface ComparisonState {
    readonly repositoryLabel: string;
    readonly settings: ComparisonSettings;
    readonly branches: ComparisonPage<ComparisonBranch> | undefined;
    readonly snapshot: ComparisonSnapshot | undefined;
    readonly files: ComparisonFiles | undefined;
    readonly commits: ComparisonPage<ComparisonCommit> | undefined;
    readonly details: ComparisonCommitDetails | undefined;
    readonly selectedFile: string | undefined;
    readonly selectedCommit: string | undefined;
    readonly fileSearch: string;
    readonly commitSearch: string;
    readonly detailSearch: string;
    readonly tab: 'files' | 'commits';
    readonly reviewed: readonly string[];
    readonly stale: boolean;
    readonly pending: Partial<Readonly<Record<ComparisonChannel, { readonly id: string; readonly append: boolean }>>>;
    readonly errors: Partial<Readonly<Record<ComparisonChannel, ProtocolError>>>;
}

export const initialComparisonState: ComparisonState = {
    repositoryLabel: '', settings: { baseBranch: '', headBranch: '', mode: ComparisonMode.SinceDivergence }, branches: undefined,
    snapshot: undefined, files: undefined, commits: undefined, details: undefined, selectedFile: undefined, selectedCommit: undefined,
    fileSearch: '', commitSearch: '', detailSearch: '', tab: 'files', reviewed: [], stale: false, pending: {}, errors: {},
};

export type ComparisonAction =
    | { readonly type: 'started'; readonly channel: ComparisonChannel; readonly request: Exclude<ComparisonRequest, { readonly type: 'comparison/cancel' }>; readonly append: boolean }
    | { readonly type: 'message'; readonly message: ComparisonResponse }
    | { readonly type: 'selectFile'; readonly path: string }
    | { readonly type: 'selectCommit'; readonly hash: string }
    | { readonly type: 'tab'; readonly tab: 'files' | 'commits' }
    | { readonly type: 'review'; readonly path: string }
    | { readonly type: 'cancel'; readonly channel: ComparisonChannel };

export function reduceComparisonState(state: ComparisonState, action: ComparisonAction): ComparisonState {
    switch (action.type) {
        case 'selectFile': return { ...state, selectedFile: action.path, errors: { ...state.errors, open: undefined } };
        case 'selectCommit': return { ...state, selectedCommit: action.hash, details: undefined, detailSearch: '', pending: { ...state.pending, details: undefined }, errors: { ...state.errors, details: undefined } };
        case 'tab': return { ...state, tab: action.tab };
        case 'review': {
            const key = reviewKey(state, action.path);
            return { ...state, reviewed: state.reviewed.includes(key) ? state.reviewed.filter(item => item !== key) : [...state.reviewed, key] };
        }
        case 'cancel': return { ...state, pending: { ...state.pending, [action.channel]: undefined } };
        case 'started': {
            const { channel, request } = action;
            const next = { ...state, pending: { ...state.pending, [channel]: { id: request.requestId, append: action.append } }, errors: { ...state.errors, [channel]: undefined } };
            if (request.type === 'comparison/dataRequest') {
                return { ...next, settings: { baseBranch: request.baseBranch, headBranch: request.headBranch, mode: request.mode }, snapshot: undefined,
                    files: undefined, commits: undefined, details: undefined, selectedFile: undefined, selectedCommit: undefined, fileSearch: '', commitSearch: '', detailSearch: '',
                    errors: {}, pending: { comparison: { id: request.requestId, append: false } } };
            }
            if (request.type === 'comparison/filesRequest') return { ...next, fileSearch: request.search, ...(action.append ? {} : { files: undefined, selectedFile: undefined }) };
            if (request.type === 'comparison/commitsRequest') return { ...next, commitSearch: request.search, ...(action.append ? {} : {
                commits: undefined, selectedCommit: undefined, details: undefined, detailSearch: '',
                pending: { ...next.pending, details: undefined }, errors: { ...next.errors, details: undefined },
            }) };
            if (request.type === 'comparison/branchesRequest' && !action.append) return { ...next, branches: undefined };
            if (request.type === 'comparison/detailsRequest') return { ...next, detailSearch: request.search };
            return next;
        }
        case 'message': return reduceMessage(state, action.message);
    }
}

export function reviewKey(state: ComparisonState, path: string): string {
    return `${state.snapshot?.leftHash}:${state.snapshot?.headHash}:${path}`;
}

function reduceMessage(state: ComparisonState, message: ComparisonResponse): ComparisonState {
    if (message.type === 'comparison/stale') return { ...state, stale: true };
    const entry = Object.entries(state.pending).find(([, pending]) => pending?.id === message.requestId);
    if (!entry) return state;
    const [channel, pending] = entry;
    const next: ComparisonState = { ...state, pending: { ...state.pending, [channel]: undefined } };
    switch (message.type) {
        case 'comparison/init': return { ...next, repositoryLabel: message.repositoryLabel, branches: message.branches, settings: { ...state.settings, baseBranch: message.baseBranch, headBranch: message.headBranch } };
        case 'comparison/branchesResponse': return { ...next, branches: mergePage(state.branches, message.branches, pending?.append) };
        case 'comparison/dataResponse': return { ...next, snapshot: message.snapshot, files: message.snapshot.files, commits: message.snapshot.commits, stale: false,
            selectedFile: message.snapshot.files.items[0]?.filePath, selectedCommit: message.snapshot.commits.items[0]?.hash };
        case 'comparison/filesResponse': {
            const files = { ...message.files, items: pending?.append ? [...(state.files?.items ?? []), ...message.files.items] : message.files.items };
            return { ...next, files, selectedFile: files.items.some(file => file.filePath === state.selectedFile) ? state.selectedFile : files.items[0]?.filePath };
        }
        case 'comparison/commitsResponse': {
            const commits = mergePage(state.commits, message.commits, pending?.append);
            return { ...next, commits, selectedCommit: commits.items.some(commit => commit.hash === state.selectedCommit) ? state.selectedCommit : commits.items[0]?.hash };
        }
        case 'comparison/detailsResponse': return { ...next, details: { ...message.details, files: mergePage(state.details?.files, message.details.files, pending?.append) } };
        case 'comparison/error': return { ...next, errors: { ...state.errors, [message.channel]: message.error } };
        case 'comparison/opened': return next;
    }
}

function mergePage<T>(previous: ComparisonPage<T> | undefined, page: ComparisonPage<T>, append = false): ComparisonPage<T> {
    return { ...page, items: append ? [...(previous?.items ?? []), ...page.items] : page.items };
}
