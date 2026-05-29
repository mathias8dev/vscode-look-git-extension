import type { ChangesExtensionToWebviewMessage } from '../../../protocol/changes/messages';
import type { StatusData } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import { readProtocolError } from '../../shared/useProtocolError';

export type ChangesViewMode = 'tree' | 'list';

export interface ChangesState {
    readonly status: StatusData;
    readonly viewMode: ChangesViewMode;
    readonly loading: boolean;
    readonly error: ProtocolError | undefined;
    readonly commitFeedback: CommitFeedback | undefined;
}

export interface CommitFeedback {
    readonly success: boolean;
    readonly message: string | undefined;
}

export type ChangesAction =
    | { readonly type: 'message'; readonly message: ChangesExtensionToWebviewMessage }
    | { readonly type: 'setViewMode'; readonly viewMode: ChangesViewMode }
    | { readonly type: 'clearError' };

export function createInitialChangesState(): ChangesState {
    return {
        status: emptyStatusData(),
        viewMode: 'tree',
        loading: true,
        error: undefined,
        commitFeedback: undefined,
    };
}

export function reduceChangesState(state: ChangesState, action: ChangesAction): ChangesState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'setViewMode':
            return { ...state, viewMode: action.viewMode };
        case 'clearError':
            return { ...state, error: undefined };
    }
}

export function getChangeCount(status: StatusData): number {
    return status.conflicts.length + status.staged.length + status.unstaged.length;
}

function reduceMessage(state: ChangesState, message: ChangesExtensionToWebviewMessage): ChangesState {
    switch (message.type) {
        case 'changes/statusData':
            return { ...state, status: message.data, loading: false, error: undefined };
        case 'changes/error':
        case 'error':
            return { ...state, loading: false, error: readProtocolError(message) };
        case 'changes/commitResult':
            return message.success
                ? { ...state, error: undefined, commitFeedback: { success: true, message: undefined } }
                : { ...state, error: message.error, commitFeedback: { success: false, message: message.message } };
        case 'repo/contextChanged':
        case 'changes/stashFiles':
            return state;
    }
}

function emptyStatusData(): StatusData {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
        stashes: [],
    };
}
