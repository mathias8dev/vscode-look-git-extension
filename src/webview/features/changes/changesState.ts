import type { ChangesExtensionToWebviewMessage } from '../../../protocol/changes/messages';
import { ConflictState, RepositoryState } from '../../../protocol/changes/types';
import type { StashFileEntry, StatusData, SubmoduleStatusData } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import { readProtocolError } from '../../shared/useProtocolError';
import { ChangeSectionId } from './changeTree';
import { rememberCommitMessage } from './commitComposerModel';

export enum ChangesViewMode {
    Tree = 'tree',
    List = 'list',
}

export enum ChangesSortMode {
    Name = 'name',
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
    readonly commitFocusRequest: number;
    readonly commitFeedback: CommitFeedback | undefined;
    readonly submoduleCommitFeedbackByPath: Readonly<Record<string, CommitFeedback>>;
    readonly collapsedSectionIds: readonly ChangeSectionId[];
    readonly selectedItemIds: readonly string[];
    readonly selectionAnchorId: string | undefined;
    readonly expandedStashIndexes: readonly number[];
    readonly stashFilesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
    readonly expandedSubmodulePaths: readonly string[];
    readonly submoduleStatusByPath: Readonly<Record<string, SubmoduleStatusData>>;
    readonly staleSubmoduleStatusPaths: readonly string[];
    readonly expandedSubmoduleStashKeys: readonly string[];
    readonly submoduleStashFilesByKey: Readonly<Record<string, readonly StashFileEntry[]>>;
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
    | { readonly type: 'clearError' }
    | { readonly type: 'toggleSubmodule'; readonly path: string }
    | { readonly type: 'toggleSubmoduleStash'; readonly key: string };

export function createInitialChangesState(preferences: ChangesStatePreferences = {}): ChangesState {
    return {
        status: emptyStatusData(),
        viewMode: preferences.viewMode ?? ChangesViewMode.Tree,
        sortMode: preferences.sortMode ?? ChangesSortMode.Path,
        pathFilter: preferences.pathFilter ?? '',
        commitMessageHistory: preferences.commitMessageHistory ?? [],
        loading: true,
        error: undefined,
        commitFocusRequest: 0,
        commitFeedback: undefined,
        submoduleCommitFeedbackByPath: {},
        collapsedSectionIds: preferences.collapsedSectionIds ?? [],
        selectedItemIds: [],
        selectionAnchorId: undefined,
        expandedStashIndexes: [],
        stashFilesByIndex: {},
        expandedSubmodulePaths: [],
        submoduleStatusByPath: {},
        staleSubmoduleStatusPaths: [],
        expandedSubmoduleStashKeys: [],
        submoduleStashFilesByKey: {},
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
        case 'toggleSubmodule':
            return { ...state, expandedSubmodulePaths: toggledPath(state.expandedSubmodulePaths, action.path) };
        case 'toggleSubmoduleStash':
            return { ...state, expandedSubmoduleStashKeys: toggledPath(state.expandedSubmoduleStashKeys, action.key) };
        case 'clearError':
            return { ...state, error: undefined };
    }
}

export function getChangeCount(status: StatusData): number {
    return status.conflicts.length + status.staged.length + status.unstaged.length;
}

function reduceMessage(state: ChangesState, message: ChangesExtensionToWebviewMessage): ChangesState {
    switch (message.type) {
        case 'changes/statusData': {
            const submodulePaths = new Set(message.data.submodules.map((submodule) => submodule.path));
            const expandedSubmodulePaths = keepKnownPaths(state.expandedSubmodulePaths, submodulePaths);
            return {
                ...state,
                status: message.data,
                loading: false,
                error: undefined,
                selectedItemIds: [],
                selectionAnchorId: undefined,
                expandedStashIndexes: keepKnownStashIndexes(state.expandedStashIndexes, state.status.stashes, message.data.stashes),
                stashFilesByIndex: keepKnownStashFilesByIndex(state.stashFilesByIndex, state.status.stashes, message.data.stashes),
                expandedSubmodulePaths,
                submoduleStatusByPath: keepKnownRecord(state.submoduleStatusByPath, submodulePaths),
                staleSubmoduleStatusPaths: uniquePaths([
                    ...keepKnownPaths(state.staleSubmoduleStatusPaths, submodulePaths),
                    ...expandedSubmodulePaths,
                ]),
                expandedSubmoduleStashKeys: keepKnownSubmoduleStashKeys(state.expandedSubmoduleStashKeys, submodulePaths),
                submoduleStashFilesByKey: keepKnownSubmoduleStashFilesByPath(state.submoduleStashFilesByKey, submodulePaths),
                submoduleCommitFeedbackByPath: keepKnownRecord(state.submoduleCommitFeedbackByPath, submodulePaths),
            };
        }
        case 'changes/error':
        case 'error':
            return { ...state, loading: false, error: readProtocolError(message) };
        case 'changes/commitResult':
            return message.success
                ? { ...state, error: undefined, commitFeedback: { success: true, message: undefined } }
                : { ...state, error: message.error, commitFeedback: { success: false, message: message.message } };
        case 'changes/submoduleCommitResult':
            return {
                ...state,
                error: message.success ? undefined : message.error,
                submoduleCommitFeedbackByPath: {
                    ...state.submoduleCommitFeedbackByPath,
                    [message.path]: {
                        success: message.success,
                        message: message.message,
                    },
                },
            };
        case 'changes/stashFiles':
            if (!isKnownStashIndex(state.status.stashes, message.index)) { return state; }
            return {
                ...state,
                loading: false,
                error: undefined,
                stashFilesByIndex: {
                    ...state.stashFilesByIndex,
                    [message.index]: message.files,
                },
            };
        case 'changes/submoduleStatusData': {
            if (!isKnownSubmodulePath(state.status, message.path)) { return state; }
            return {
                ...state,
                error: undefined,
                staleSubmoduleStatusPaths: state.staleSubmoduleStatusPaths.filter((path) => path !== message.path),
                expandedSubmoduleStashKeys: keepKnownStashKeysForPath(
                    state.expandedSubmoduleStashKeys,
                    message.path,
                    state.submoduleStatusByPath[message.path]?.stashes ?? [],
                    message.data.stashes,
                ),
                submoduleStatusByPath: {
                    ...state.submoduleStatusByPath,
                    [message.path]: message.data,
                },
                submoduleStashFilesByKey: keepKnownStashFilesForPath(
                    state.submoduleStashFilesByKey,
                    message.path,
                    state.submoduleStatusByPath[message.path]?.stashes ?? [],
                    message.data.stashes,
                ),
            };
        }
        case 'changes/submoduleStashFiles':
            if (!isKnownSubmodulePath(state.status, message.path)) { return state; }
            if (!isKnownSubmoduleStash(state.submoduleStatusByPath, message.path, message.index)) { return state; }
            return {
                ...state,
                loading: false,
                error: undefined,
                submoduleStashFilesByKey: {
                    ...state.submoduleStashFilesByKey,
                    [submoduleStashKey(message.path, message.index)]: message.files,
                },
            };
        case 'changes/applyViewMode':
            return { ...state, viewMode: message.viewMode === ChangesViewMode.List ? ChangesViewMode.List : ChangesViewMode.Tree };
        case 'changes/applySortMode':
            return { ...state, sortMode: sortModeFromProtocol(message.sortMode), selectedItemIds: [], selectionAnchorId: undefined };
        case 'changes/focusCommitComposer':
            return { ...state, commitFocusRequest: state.commitFocusRequest + 1 };
        case 'repo/contextChanged':
            return state;
    }
}

function sortModeFromProtocol(sortMode: 'name' | 'path' | 'status' | 'directory'): ChangesSortMode {
    switch (sortMode) {
        case 'name': return ChangesSortMode.Name;
        case 'status': return ChangesSortMode.Status;
        case 'directory': return ChangesSortMode.Directory;
        case 'path': return ChangesSortMode.Path;
    }
}

export function submoduleStashKey(submodulePath: string, index: number): string {
    return `${submodulePath}\0${index}`;
}

function keepKnownPaths(paths: readonly string[], knownPaths: ReadonlySet<string>): readonly string[] {
    return paths.filter((path) => knownPaths.has(path));
}

function uniquePaths(paths: readonly string[]): readonly string[] {
    return Array.from(new Set(paths));
}

function keepKnownStashIndexes(
    indexes: readonly number[],
    previousStashes: StatusData['stashes'],
    nextStashes: StatusData['stashes'],
): readonly number[] {
    return indexes.filter((index) => isSameStashIndex(index, previousStashes, nextStashes));
}

function keepKnownStashFilesByIndex(
    filesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>,
    previousStashes: StatusData['stashes'],
    nextStashes: StatusData['stashes'],
): Readonly<Record<number, readonly StashFileEntry[]>> {
    return Object.fromEntries(
        Object.entries(filesByIndex)
            .filter(([index]) => isSameStashIndex(Number(index), previousStashes, nextStashes)),
    );
}

function keepKnownSubmoduleStashKeys(keys: readonly string[], knownPaths: ReadonlySet<string>): readonly string[] {
    return keys.filter((key) => knownPaths.has(submodulePathFromStashKey(key)));
}

function keepKnownRecord<T>(record: Readonly<Record<string, T>>, knownPaths: ReadonlySet<string>): Readonly<Record<string, T>> {
    return Object.fromEntries(Object.entries(record).filter(([path]) => knownPaths.has(path)));
}

function keepKnownSubmoduleStashFilesByPath(
    filesByKey: Readonly<Record<string, readonly StashFileEntry[]>>,
    knownPaths: ReadonlySet<string>,
): Readonly<Record<string, readonly StashFileEntry[]>> {
    return Object.fromEntries(
        Object.entries(filesByKey).filter(([key]) => knownPaths.has(submodulePathFromStashKey(key))),
    );
}

function keepKnownStashKeysForPath(
    keys: readonly string[],
    path: string,
    previousStashes: StatusData['stashes'],
    nextStashes: StatusData['stashes'],
): readonly string[] {
    return keys.filter((key) => {
        if (submodulePathFromStashKey(key) !== path) { return true; }
        return isSameStashIndex(stashIndexFromSubmoduleKey(key), previousStashes, nextStashes);
    });
}

function keepKnownStashFilesForPath(
    filesByKey: Readonly<Record<string, readonly StashFileEntry[]>>,
    path: string,
    previousStashes: StatusData['stashes'],
    nextStashes: StatusData['stashes'],
): Readonly<Record<string, readonly StashFileEntry[]>> {
    return Object.fromEntries(
        Object.entries(filesByKey).filter(([key]) => {
            if (submodulePathFromStashKey(key) !== path) { return true; }
            return isSameStashIndex(stashIndexFromSubmoduleKey(key), previousStashes, nextStashes);
        }),
    );
}

function submodulePathFromStashKey(key: string): string {
    return key.split('\0', 1)[0] ?? key;
}

function isKnownSubmodulePath(status: StatusData, path: string): boolean {
    return status.submodules.some((submodule) => submodule.path === path);
}

function isKnownStashIndex(stashes: StatusData['stashes'], index: number): boolean {
    return stashes.some((stash) => stash.index === index);
}

function isSameStashIndex(
    index: number,
    previousStashes: StatusData['stashes'],
    nextStashes: StatusData['stashes'],
): boolean {
    const previous = previousStashes.find((stash) => stash.index === index);
    const next = nextStashes.find((stash) => stash.index === index);
    return Boolean(next && (!previous || previous.message === next.message));
}

function stashIndexFromSubmoduleKey(key: string): number {
    return Number(key.split('\0')[1]);
}

function isKnownSubmoduleStash(
    statusByPath: Readonly<Record<string, SubmoduleStatusData>>,
    path: string,
    index: number,
): boolean {
    return statusByPath[path]?.stashes.some((stash) => stash.index === index) ?? false;
}

function toggledIndex(indexes: readonly number[], index: number): readonly number[] {
    return indexes.includes(index) ? indexes.filter((entry) => entry !== index) : [...indexes, index];
}

function toggledPath(paths: readonly string[], path: string): readonly string[] {
    return paths.includes(path) ? paths.filter((entry) => entry !== path) : [...paths, path];
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
        submodules: [],
    };
}
