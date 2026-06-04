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
    Extension = 'extension',
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
    readonly commitMessageGenerationRequestId: string | undefined;
    readonly generatedCommitMessage: GeneratedCommitMessage | undefined;
    readonly commitMessageGenerationError: ProtocolError | undefined;
    readonly submoduleCommitFeedbackByPath: Readonly<Record<string, CommitFeedback>>;
    readonly submoduleCommitMessageGenerationRequestIdByPath: Readonly<Record<string, string>>;
    readonly generatedSubmoduleCommitMessageByPath: Readonly<Record<string, GeneratedCommitMessage>>;
    readonly submoduleCommitMessageGenerationErrorByPath: Readonly<Record<string, ProtocolError>>;
    readonly submoduleCommitFocusRequestByPath: Readonly<Record<string, number>>;
    readonly collapsedSectionIds: readonly ChangeSectionId[];
    readonly selectedItemIds: readonly string[];
    readonly selectionAnchorId: string | undefined;
    readonly expandedStashIndexes: readonly number[];
    readonly stashFilesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
    readonly expandedSubmodulePaths: readonly string[];
    readonly submoduleStatusByPath: Readonly<Record<string, SubmoduleStatusData>>;
    readonly staleSubmoduleStatusPaths: readonly string[];
    readonly loadingSubmoduleStatusPaths: readonly string[];
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

export interface GeneratedCommitMessage {
    readonly requestId: string;
    readonly message: string;
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
    | { readonly type: 'requestCommitMessageGeneration'; readonly requestId: string }
    | { readonly type: 'requestSubmoduleCommitMessageGeneration'; readonly path: string; readonly requestId: string }
    | { readonly type: 'clearSubmoduleCommitMessageGeneration'; readonly path: string }
    | { readonly type: 'toggleSection'; readonly sectionId: ChangeSectionId }
    | { readonly type: 'selectChange'; readonly selection: SelectChangeInput }
    | { readonly type: 'clearSelection' }
    | { readonly type: 'toggleStash'; readonly index: number }
    | { readonly type: 'clearError' }
    | { readonly type: 'clearCommitFeedback' }
    | { readonly type: 'clearSubmoduleCommitFeedback'; readonly path: string }
    | { readonly type: 'toggleSubmodule'; readonly path: string }
    | { readonly type: 'requestSubmoduleStatus'; readonly path: string }
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
        commitMessageGenerationRequestId: undefined,
        generatedCommitMessage: undefined,
        commitMessageGenerationError: undefined,
        submoduleCommitFeedbackByPath: {},
        submoduleCommitMessageGenerationRequestIdByPath: {},
        generatedSubmoduleCommitMessageByPath: {},
        submoduleCommitMessageGenerationErrorByPath: {},
        submoduleCommitFocusRequestByPath: {},
        collapsedSectionIds: preferences.collapsedSectionIds ?? [],
        selectedItemIds: [],
        selectionAnchorId: undefined,
        expandedStashIndexes: [],
        stashFilesByIndex: {},
        expandedSubmodulePaths: [],
        submoduleStatusByPath: {},
        staleSubmoduleStatusPaths: [],
        loadingSubmoduleStatusPaths: [],
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
            return {
                ...state,
                commitMessageHistory: rememberCommitMessage(state.commitMessageHistory, action.message),
                commitMessageGenerationRequestId: undefined,
                generatedCommitMessage: undefined,
                commitMessageGenerationError: undefined,
            };
        case 'requestCommitMessageGeneration':
            return {
                ...state,
                commitMessageGenerationRequestId: action.requestId,
                generatedCommitMessage: undefined,
                commitMessageGenerationError: undefined,
                commitFeedback: undefined,
            };
        case 'requestSubmoduleCommitMessageGeneration':
            return {
                ...state,
                submoduleCommitMessageGenerationRequestIdByPath: {
                    ...state.submoduleCommitMessageGenerationRequestIdByPath,
                    [action.path]: action.requestId,
                },
                generatedSubmoduleCommitMessageByPath: withoutKey(state.generatedSubmoduleCommitMessageByPath, action.path),
                submoduleCommitMessageGenerationErrorByPath: withoutKey(state.submoduleCommitMessageGenerationErrorByPath, action.path),
                submoduleCommitFeedbackByPath: withoutKey(state.submoduleCommitFeedbackByPath, action.path),
            };
        case 'clearSubmoduleCommitMessageGeneration':
            return {
                ...state,
                submoduleCommitMessageGenerationRequestIdByPath: withoutKey(state.submoduleCommitMessageGenerationRequestIdByPath, action.path),
                generatedSubmoduleCommitMessageByPath: withoutKey(state.generatedSubmoduleCommitMessageByPath, action.path),
                submoduleCommitMessageGenerationErrorByPath: withoutKey(state.submoduleCommitMessageGenerationErrorByPath, action.path),
            };
        case 'toggleSection':
            return { ...state, collapsedSectionIds: toggledSection(state.collapsedSectionIds, action.sectionId) };
        case 'selectChange':
            return reduceSelection(state, action.selection);
        case 'clearSelection':
            return { ...state, selectedItemIds: [], selectionAnchorId: undefined };
        case 'toggleStash':
            return { ...state, expandedStashIndexes: toggledIndex(state.expandedStashIndexes, action.index) };
        case 'clearCommitFeedback':
            return { ...state, commitFeedback: undefined };
        case 'clearSubmoduleCommitFeedback':
            return { ...state, submoduleCommitFeedbackByPath: withoutKey(state.submoduleCommitFeedbackByPath, action.path) };
        case 'toggleSubmodule':
            return { ...state, expandedSubmodulePaths: toggledPath(state.expandedSubmodulePaths, action.path) };
        case 'requestSubmoduleStatus':
            return { ...state, loadingSubmoduleStatusPaths: addedPath(state.loadingSubmoduleStatusPaths, action.path) };
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
                generatedCommitMessage: undefined,
                commitMessageGenerationError: undefined,
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
                loadingSubmoduleStatusPaths: keepKnownPaths(state.loadingSubmoduleStatusPaths, submodulePaths),
                expandedSubmoduleStashKeys: keepKnownSubmoduleStashKeys(state.expandedSubmoduleStashKeys, submodulePaths),
                submoduleStashFilesByKey: keepKnownSubmoduleStashFilesByPath(state.submoduleStashFilesByKey, submodulePaths),
                submoduleCommitFeedbackByPath: keepKnownRecord(state.submoduleCommitFeedbackByPath, submodulePaths),
                submoduleCommitMessageGenerationRequestIdByPath: keepKnownRecord(state.submoduleCommitMessageGenerationRequestIdByPath, submodulePaths),
                generatedSubmoduleCommitMessageByPath: keepKnownRecord(state.generatedSubmoduleCommitMessageByPath, submodulePaths),
                submoduleCommitMessageGenerationErrorByPath: keepKnownRecord(state.submoduleCommitMessageGenerationErrorByPath, submodulePaths),
                submoduleCommitFocusRequestByPath: keepKnownRecord(state.submoduleCommitFocusRequestByPath, submodulePaths),
            };
        }
        case 'changes/error':
        case 'error': {
            const failedSubmodulePath = submodulePathFromStatusRequestId(message.requestId);
            const failedCommitMessageGeneration = state.commitMessageGenerationRequestId === message.requestId;
            const failedSubmoduleCommitMessageGenerationPath = pathForRequestId(
                state.submoduleCommitMessageGenerationRequestIdByPath,
                message.requestId,
            );
            const protocolError = readProtocolError(message);
            return {
                ...state,
                loading: false,
                error: protocolError,
                commitMessageGenerationRequestId: failedCommitMessageGeneration ? undefined : state.commitMessageGenerationRequestId,
                commitMessageGenerationError: failedCommitMessageGeneration ? protocolError : state.commitMessageGenerationError,
                submoduleCommitMessageGenerationRequestIdByPath: failedSubmoduleCommitMessageGenerationPath
                    ? withoutKey(state.submoduleCommitMessageGenerationRequestIdByPath, failedSubmoduleCommitMessageGenerationPath)
                    : state.submoduleCommitMessageGenerationRequestIdByPath,
                submoduleCommitMessageGenerationErrorByPath: failedSubmoduleCommitMessageGenerationPath && protocolError
                    ? { ...state.submoduleCommitMessageGenerationErrorByPath, [failedSubmoduleCommitMessageGenerationPath]: protocolError }
                    : state.submoduleCommitMessageGenerationErrorByPath,
                loadingSubmoduleStatusPaths: failedSubmodulePath
                    ? state.loadingSubmoduleStatusPaths.filter((path) => path !== failedSubmodulePath)
                    : state.loadingSubmoduleStatusPaths,
            };
        }
        case 'changes/generatedCommitMessage':
            if (state.commitMessageGenerationRequestId !== message.requestId) { return state; }
            return {
                ...state,
                error: undefined,
                commitMessageGenerationRequestId: undefined,
                commitMessageGenerationError: undefined,
                generatedCommitMessage: {
                    requestId: message.requestId,
                    message: message.message,
                },
            };
        case 'changes/submoduleGeneratedCommitMessage':
            if (state.submoduleCommitMessageGenerationRequestIdByPath[message.path] !== message.requestId) { return state; }
            return {
                ...state,
                error: undefined,
                submoduleCommitMessageGenerationRequestIdByPath: withoutKey(state.submoduleCommitMessageGenerationRequestIdByPath, message.path),
                submoduleCommitMessageGenerationErrorByPath: withoutKey(state.submoduleCommitMessageGenerationErrorByPath, message.path),
                generatedSubmoduleCommitMessageByPath: {
                    ...state.generatedSubmoduleCommitMessageByPath,
                    [message.path]: {
                        requestId: message.requestId,
                        message: message.message,
                    },
                },
            };
        case 'changes/commitResult':
            return message.success
                ? {
                    ...state,
                    error: undefined,
                    generatedCommitMessage: undefined,
                    commitMessageGenerationError: undefined,
                    commitFeedback: { success: true, message: undefined },
                }
                : { ...state, error: message.error, commitFeedback: { success: false, message: message.message } };
        case 'changes/submoduleCommitResult':
            return {
                ...state,
                error: message.success ? undefined : message.error,
                generatedSubmoduleCommitMessageByPath: message.success
                    ? withoutKey(state.generatedSubmoduleCommitMessageByPath, message.path)
                    : state.generatedSubmoduleCommitMessageByPath,
                submoduleCommitMessageGenerationErrorByPath: message.success
                    ? withoutKey(state.submoduleCommitMessageGenerationErrorByPath, message.path)
                    : state.submoduleCommitMessageGenerationErrorByPath,
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
                loadingSubmoduleStatusPaths: state.loadingSubmoduleStatusPaths.filter((path) => path !== message.path),
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
        case 'changes/focusSubmoduleCommitComposer':
            return {
                ...state,
                expandedSubmodulePaths: addedPath(state.expandedSubmodulePaths, message.path),
                submoduleCommitFocusRequestByPath: {
                    ...state.submoduleCommitFocusRequestByPath,
                    [message.path]: (state.submoduleCommitFocusRequestByPath[message.path] ?? 0) + 1,
                },
            };
        case 'repo/contextChanged':
            return state;
        case 'ui/fontSizeChanged':
            return state;
    }
}

function sortModeFromProtocol(sortMode: 'name' | 'path' | 'status' | 'extension' | 'directory'): ChangesSortMode {
    switch (sortMode) {
        case 'name': return ChangesSortMode.Name;
        case 'status': return ChangesSortMode.Status;
        case 'extension': return ChangesSortMode.Extension;
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

function pathForRequestId(requestIdsByPath: Readonly<Record<string, string>>, requestId: string | undefined): string | undefined {
    if (!requestId) { return undefined; }
    return Object.entries(requestIdsByPath).find(([, id]) => id === requestId)?.[0];
}

function withoutKey<TValue>(record: Readonly<Record<string, TValue>>, key: string): Readonly<Record<string, TValue>> {
    if (!Object.prototype.hasOwnProperty.call(record, key)) { return record; }
    const next: Record<string, TValue> = {};
    for (const [recordKey, value] of Object.entries(record)) {
        if (recordKey !== key) { next[recordKey] = value; }
    }
    return next;
}

function uniquePaths(paths: readonly string[]): readonly string[] {
    return Array.from(new Set(paths));
}

function addedPath(paths: readonly string[], path: string): readonly string[] {
    return paths.includes(path) ? paths : [...paths, path];
}

function submodulePathFromStatusRequestId(requestId: string | undefined): string | undefined {
    const prefix = 'changes:submodule-status:';
    if (!requestId?.startsWith(prefix)) { return undefined; }
    return requestId.substring(prefix.length);
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
