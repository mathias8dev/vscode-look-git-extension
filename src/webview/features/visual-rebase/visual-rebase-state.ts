import type { VisualRebaseExtensionToWebviewMessage, VisualRebaseOperation, VisualRebaseRecommendedAction } from '@protocol/visual-rebase/messages';
import type { VisualRebaseCommit, VisualRebaseCommitDetails, VisualRebaseConflictFile, VisualRebaseRef, VisualRebaseSafety } from '@protocol/visual-rebase/types';

export type VisualRebasePhase = 'loading' | 'planning' | 'running' | 'paused' | 'conflicts' | 'completed' | 'failed' | 'aborted';

export interface VisualRebaseNotice {
    readonly message: string;
    readonly details?: string;
    readonly recommendedAction?: VisualRebaseRecommendedAction;
}

export interface VisualRebaseState {
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly commits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety | undefined;
    readonly refs: readonly VisualRebaseRef[];
    readonly phase: VisualRebasePhase;
    readonly running: boolean;
    readonly operation: VisualRebaseOperation | undefined;
    readonly previewRunning: boolean;
    readonly previewError: string | undefined;
    readonly commitDetails: VisualRebaseCommitDetails | undefined;
    readonly commitDetailsLoading: boolean;
    readonly commitDetailsError: string | undefined;
    readonly activeCommitDetailsRequestId: string | undefined;
    readonly activeCommitDetailsHash: string | undefined;
    readonly notice: VisualRebaseNotice | undefined;
    readonly conflictFiles: readonly VisualRebaseConflictFile[];
    readonly completedBackupRef: string | undefined;
}

export type VisualRebaseStateAction =
    | { readonly type: 'message'; readonly message: VisualRebaseExtensionToWebviewMessage }
    | { readonly type: 'previewStarted' }
    | { readonly type: 'commitDetailsStarted'; readonly requestId: string; readonly hash: string }
    | { readonly type: 'reviewPlan' };

export const initialVisualRebaseState: VisualRebaseState = {
    title: 'Visual Rebase',
    currentBranch: '',
    upstream: '',
    onto: '',
    commits: [],
    safety: undefined,
    refs: [],
    phase: 'loading',
    running: false,
    operation: undefined,
    previewRunning: false,
    previewError: undefined,
    commitDetails: undefined,
    commitDetailsLoading: false,
    commitDetailsError: undefined,
    activeCommitDetailsRequestId: undefined,
    activeCommitDetailsHash: undefined,
    notice: undefined,
    conflictFiles: [],
    completedBackupRef: undefined,
};

export function reduceVisualRebaseState(state: VisualRebaseState, action: VisualRebaseStateAction): VisualRebaseState {
    if (action.type === 'previewStarted') {
        return { ...state, previewRunning: true, previewError: undefined };
    }
    if (action.type === 'commitDetailsStarted') {
        return {
            ...state,
            commitDetails: undefined,
            commitDetailsLoading: true,
            commitDetailsError: undefined,
            activeCommitDetailsRequestId: action.requestId,
            activeCommitDetailsHash: action.hash,
        };
    }
    if (action.type === 'reviewPlan') {
        return {
            ...state,
            phase: 'planning',
            running: false,
            operation: undefined,
            notice: undefined,
            conflictFiles: [],
        };
    }

    const message = action.message;
    switch (message.type) {
        case 'visualRebase/init':
            return {
                ...state,
                title: message.title,
                currentBranch: message.currentBranch,
                upstream: message.upstream,
                onto: message.onto,
                commits: message.commits,
                safety: message.safety,
                refs: message.refs,
                phase: 'planning',
                previewError: undefined,
                commitDetails: undefined,
                commitDetailsLoading: message.commits.length > 0,
                commitDetailsError: undefined,
                activeCommitDetailsRequestId: undefined,
                activeCommitDetailsHash: undefined,
            };
        case 'visualRebase/started':
            return {
                ...state,
                phase: message.operation === 'resolveConflict' ? state.phase : 'running',
                running: true,
                operation: message.operation,
                notice: message.operation === 'resolveConflict' ? state.notice : undefined,
            };
        case 'visualRebase/paused':
            return {
                ...state,
                phase: message.reason === 'conflicts' ? 'conflicts' : 'paused',
                running: false,
                operation: undefined,
                notice: {
                    message: message.message,
                    ...(message.details ? { details: message.details } : {}),
                    ...(message.recommendedAction ? { recommendedAction: message.recommendedAction } : {}),
                },
                conflictFiles: message.conflictFiles,
            };
        case 'visualRebase/completed':
            return {
                ...state,
                phase: 'completed',
                running: false,
                operation: undefined,
                notice: undefined,
                conflictFiles: [],
                completedBackupRef: message.backupRef,
            };
        case 'visualRebase/aborted':
            return {
                ...state,
                phase: 'aborted',
                running: false,
                operation: undefined,
                notice: undefined,
                conflictFiles: [],
            };
        case 'visualRebase/error':
            return {
                ...state,
                phase: 'failed',
                running: false,
                operation: undefined,
                notice: {
                    message: message.message,
                    ...(message.details ? { details: message.details } : {}),
                },
                conflictFiles: [],
            };
        case 'visualRebase/previewResponse':
            return {
                ...state,
                previewRunning: false,
                previewError: message.error,
                ...(message.error ? {} : {
                    upstream: message.rewriteAfter,
                    onto: message.replayOnto,
                    commits: message.commits ?? [],
                    commitDetails: undefined,
                    commitDetailsLoading: (message.commits?.length ?? 0) > 0,
                    commitDetailsError: undefined,
                    activeCommitDetailsRequestId: undefined,
                    activeCommitDetailsHash: undefined,
                    ...(message.safety ? { safety: message.safety } : {}),
                }),
            };
        case 'visualRebase/commitDetailsResponse':
            if (message.requestId !== state.activeCommitDetailsRequestId || message.hash !== state.activeCommitDetailsHash) { return state; }
            return {
                ...state,
                commitDetails: message.error ? undefined : { hash: message.hash, files: message.files },
                commitDetailsLoading: false,
                commitDetailsError: message.error,
                activeCommitDetailsRequestId: undefined,
                activeCommitDetailsHash: undefined,
            };
        default:
            return state;
    }
}
