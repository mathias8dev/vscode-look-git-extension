import type { ChangesExtensionToWebviewMessage } from '../../../protocol/changes/messages';
import { ConflictState, RepositoryState } from '../../../protocol/changes/types';
import type { StashFileEntry, StatusData } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import { readProtocolError } from '../../shared/useProtocolError';
import { ChangeSectionId } from './changeTree';
import { rememberCommitMessage } from './commitComposerModel';

export enum ChangesViewMode {
    Tree = 'tree',
    List = 'list',
}

export enum ChangesSortMode {
    Path = 'path',
    Status = 'status',
    Directory = 'directory',
}

export enum ChangeSelectionMode {
    Replace = 'replace',
    Toggle = 'toggle',
    Range = 'range',
}

export interface ChangesState {
    readonly status: StatusData;
    readonly viewMode: ChangesViewMode;
    readonly sortMode: ChangesSortMode;
    readonly pathFilter: string;
    readonly commitMessageHistory: readonly string[];
    readonly loading: boolean;
    readonly error: ProtocolError | undefined;
    readonly commitFeedback: CommitFeedback | undefined;
    readonly collapsedSectionIds: readonly ChangeSectionId[];
    readonly selectedItemIds: readonly string[];
    readonly selectionAnchorId: string | undefined;
    readonly expandedStashIndexes: readonly number[];
    readonly stashFilesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
}

export interface ChangesStatePreferences {
    readonly viewMode?: ChangesViewMode;
    readonly sortMode?: ChangesSortMode;
    readonly pathFilter?: string;
    readonly collapsedSectionIds?: readonly ChangeSectionId[];
    readonly commitMessageHistory?: readonly string[];
}

export interface CommitFeedback {
    readonly success: boolean;
    readonly message: string | undefined;
}

export interface SelectChangeInput {
    readonly itemId: string;
    readonly visibleItemIds: readonly string[];
    readonly mode: ChangeSelectionMode;
}

export type ChangesAction =
    | { readonly type: 'message'; readonly message: ChangesExtensionToWebviewMessage }
    | { readonly type: 'setViewMode'; readonly viewMode: ChangesViewMode }
    | { readonly type: 'setSortMode'; readonly sortMode: ChangesSortMode }
    | { readonly type: 'setPathFilter'; readonly pathFilter: string }
    | { readonly type: 'rememberCommitMessage'; readonly message: string }
    | { readonly type: 'toggleSection'; readonly sectionId: ChangeSectionId }
    | { readonly type: 'selectChange'; readonly selection: SelectChangeInput }
    | { readonly type: 'clearSelection' }
    | { readonly type: 'toggleStash'; readonly index: number }
    | { readonly type: 'clearError' };

export function createInitialChangesState(preferences: ChangesStatePreferences = {}): ChangesState {
    return {
        status: emptyStatusData(),
        viewMode: preferences.viewMode ?? ChangesViewMode.Tree,
        sortMode: preferences.sortMode ?? ChangesSortMode.Path,
        pathFilter: preferences.pathFilter ?? '',
        commitMessageHistory: preferences.commitMessageHistory ?? [],
        loading: true,
        error: undefined,
        commitFeedback: undefined,
        collapsedSectionIds: preferences.collapsedSectionIds ?? [],
        selectedItemIds: [],
        selectionAnchorId: undefined,
        expandedStashIndexes: [],
        stashFilesByIndex: {},
    };
}

export function reduceChangesState(state: ChangesState, action: ChangesAction): ChangesState {
    switch (action.type) {
        case 'message':
            return reduceMessage(state, action.message);
        case 'setViewMode':
            return { ...state, viewMode: action.viewMode };
        case 'setSortMode':
            return { ...state, sortMode: action.sortMode, selectedItemIds: [], selectionAnchorId: undefined };
        case 'setPathFilter':
            return { ...state, pathFilter: action.pathFilter, selectedItemIds: [], selectionAnchorId: undefined };
        case 'rememberCommitMessage':
            return { ...state, commitMessageHistory: rememberCommitMessage(state.commitMessageHistory, action.message) };
        case 'toggleSection':
            return { ...state, collapsedSectionIds: toggledSection(state.collapsedSectionIds, action.sectionId) };
        case 'selectChange':
            return reduceSelection(state, action.selection);
        case 'clearSelection':
            return { ...state, selectedItemIds: [], selectionAnchorId: undefined };
        case 'toggleStash':
            return { ...state, expandedStashIndexes: toggledIndex(state.expandedStashIndexes, action.index) };
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
            return {
                ...state,
                status: message.data,
                loading: false,
                error: undefined,
                selectedItemIds: [],
                selectionAnchorId: undefined,
                expandedStashIndexes: [],
                stashFilesByIndex: {},
            };
        case 'changes/error':
        case 'error':
            return { ...state, loading: false, error: readProtocolError(message) };
        case 'changes/commitResult':
            return message.success
                ? { ...state, error: undefined, commitFeedback: { success: true, message: undefined } }
                : { ...state, error: message.error, commitFeedback: { success: false, message: message.message } };
        case 'changes/stashFiles':
            return {
                ...state,
                loading: false,
                error: undefined,
                stashFilesByIndex: {
                    ...state.stashFilesByIndex,
                    [message.index]: message.files,
                },
            };
        case 'repo/contextChanged':
            return state;
    }
}

function toggledIndex(indexes: readonly number[], index: number): readonly number[] {
    return indexes.includes(index) ? indexes.filter((entry) => entry !== index) : [...indexes, index];
}

function toggledSection(sectionIds: readonly ChangeSectionId[], sectionId: ChangeSectionId): readonly ChangeSectionId[] {
    return sectionIds.includes(sectionId)
        ? sectionIds.filter((entry) => entry !== sectionId)
        : [...sectionIds, sectionId];
}

function reduceSelection(state: ChangesState, input: SelectChangeInput): ChangesState {
    if (input.mode === ChangeSelectionMode.Range) {
        const anchorId = state.selectionAnchorId ?? input.itemId;
        return {
            ...state,
            selectedItemIds: rangeSelection(input.visibleItemIds, anchorId, input.itemId),
            selectionAnchorId: anchorId,
        };
    }

    if (input.mode === ChangeSelectionMode.Toggle) {
        return {
            ...state,
            selectedItemIds: toggledItem(state.selectedItemIds, input.itemId),
            selectionAnchorId: input.itemId,
        };
    }

    return {
        ...state,
        selectedItemIds: [input.itemId],
        selectionAnchorId: input.itemId,
    };
}

function toggledItem(itemIds: readonly string[], itemId: string): readonly string[] {
    return itemIds.includes(itemId)
        ? itemIds.filter((entry) => entry !== itemId)
        : [...itemIds, itemId];
}

function rangeSelection(visibleItemIds: readonly string[], anchorId: string, itemId: string): readonly string[] {
    const anchorIndex = visibleItemIds.indexOf(anchorId);
    const itemIndex = visibleItemIds.indexOf(itemId);
    if (anchorIndex === -1 || itemIndex === -1) { return [itemId]; }
    const start = Math.min(anchorIndex, itemIndex);
    const end = Math.max(anchorIndex, itemIndex);
    return visibleItemIds.slice(start, end + 1);
}

function emptyStatusData(): StatusData {
    return {
        repositoryState: RepositoryState.Missing,
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: ConflictState.None,
        stashes: [],
    };
}
