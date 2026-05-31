import { useEffect, useReducer } from 'react';
import type { ChangesExtensionToWebviewMessage, ChangesWebviewToExtensionMessage } from '../../protocol/changes/messages';
import type { CommitMode, StashFileEntry } from '../../protocol/changes/types';
import { messageForBulkAction, messageForRowAction, type ChangeBulkAction, type ChangeRowAction } from '../features/changes/changeCommands';
import type { ChangeListItem, ChangeSectionId } from '../features/changes/changeTree';
import { ChangesApp } from '../features/changes/ChangesApp';
import {
    createInitialChangesState,
    reduceChangesState,
    submoduleStashKey,
    type ChangeSelectionMode,
} from '../features/changes/changesState';
import { changesStateToPersisted, readChangesStatePreferences } from '../features/changes/changesPersistence';
import { messageForOperationAction, type ActiveConflictState, type OperationAction } from '../features/changes/operationCommands';
import {
    messageForCreateStash,
    messageForStashAction,
    messageForStashFileDiff,
    StashEntryAction,
    type CreateStashKind,
} from '../features/changes/stashCommands';
import {
    messageForSubmoduleAction,
    messageForSubmoduleBulkAction,
    messageForSubmoduleCommit,
    messageForSubmoduleRowAction,
    messageForSubmoduleStash,
    messageForSubmoduleStashAction,
    messageForSubmoduleStashFileDiff,
    messageForGetSubmoduleStatus,
    submoduleStatusRequestId,
    SubmoduleAction,
} from '../features/changes/submoduleCommands';
import { vscodeApi } from '../platform/vscodeHost';

export function ChangesWebview() {
    const [state, dispatch] = useReducer(
        reduceChangesState,
        readChangesStatePreferences(vscodeApi.getState()),
        createInitialChangesState,
    );

    useEffect(() => {
        const onMessage = (event: MessageEvent<ChangesExtensionToWebviewMessage>) => {
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        postToExtension({ type: 'changes/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        vscodeApi.setState(changesStateToPersisted(state));
    }, [state]);

    const toggleStash = (index: number) => {
        const isExpanded = state.expandedStashIndexes.includes(index);
        const hasFiles = Object.prototype.hasOwnProperty.call(state.stashFilesByIndex, index);
        dispatch({ type: 'toggleStash', index });
        if (!isExpanded && !hasFiles) {
            postToExtension(messageForStashAction(index, StashEntryAction.LoadFiles));
        }
    };

    const toggleSubmodule = (submodulePath: string) => {
        const isExpanded = state.expandedSubmodulePaths.includes(submodulePath);
        const hasStatus = Object.prototype.hasOwnProperty.call(state.submoduleStatusByPath, submodulePath);
        dispatch({ type: 'toggleSubmodule', path: submodulePath });
        if (!isExpanded && !hasStatus) {
            postToExtension(messageForGetSubmoduleStatus(submodulePath, submoduleStatusRequestId(submodulePath)));
        }
    };

    const toggleSubmoduleStash = (submodulePath: string, index: number) => {
        const key = submoduleStashKey(submodulePath, index);
        const isExpanded = state.expandedSubmoduleStashKeys.includes(key);
        const hasFiles = Object.prototype.hasOwnProperty.call(state.submoduleStashFilesByKey, key);
        dispatch({ type: 'toggleSubmoduleStash', key });
        if (!isExpanded && !hasFiles) {
            postToExtension(messageForSubmoduleStashAction(submodulePath, index, StashEntryAction.LoadFiles));
        }
    };

    return (
        <ChangesApp
            state={state}
            onSectionToggle={(sectionId: ChangeSectionId) => dispatch({ type: 'toggleSection', sectionId })}
            onSelectItem={(item: ChangeListItem, mode: ChangeSelectionMode, visibleItemIds: readonly string[]) => {
                dispatch({ type: 'selectChange', selection: { itemId: item.id, mode, visibleItemIds } });
            }}
            onRowAction={(item: ChangeListItem, action: ChangeRowAction) => postToExtension(messageForRowAction(item, action))}
            onBulkAction={(action: ChangeBulkAction) => postToExtension(messageForBulkAction(action))}
            onCommit={(message: string, mode: CommitMode) => {
                dispatch({ type: 'rememberCommitMessage', message });
                postToExtension({ type: 'changes/commit', message, mode });
            }}
            onOperationAction={(conflictState: ActiveConflictState, action: OperationAction) => {
                postToExtension(messageForOperationAction(conflictState, action));
            }}
            onCreateStash={(kind: CreateStashKind, message: string) => postToExtension(messageForCreateStash(kind, message))}
            onToggleStash={toggleStash}
            onStashAction={(index: number, action: StashEntryAction) => postToExtension(messageForStashAction(index, action))}
            onStashFileDiff={(index: number, file: StashFileEntry) => postToExtension(messageForStashFileDiff(index, file))}
            onToggleSubmodule={toggleSubmodule}
            onSubmoduleAction={(path: string, action: SubmoduleAction) => postToExtension(messageForSubmoduleAction(path, action))}
            onSubmoduleRowAction={(submodulePath: string, item: ChangeListItem, action: ChangeRowAction) =>
                postToExtension(messageForSubmoduleRowAction(submodulePath, item.entry, item.isStaged, action))}
            onSubmoduleBulkAction={(submodulePath: string, action: ChangeBulkAction) =>
                postToExtension(messageForSubmoduleBulkAction(submodulePath, action))}
            onSubmoduleCommit={(submodulePath: string, message: string, mode: CommitMode) => {
                dispatch({ type: 'rememberCommitMessage', message });
                postToExtension(messageForSubmoduleCommit(submodulePath, message, mode));
            }}
            onSubmoduleCreateStash={(submodulePath: string, message: string) =>
                postToExtension(messageForSubmoduleStash(submodulePath, message))}
            onToggleSubmoduleStash={toggleSubmoduleStash}
            onSubmoduleStashAction={(submodulePath: string, index: number, action: StashEntryAction) =>
                postToExtension(messageForSubmoduleStashAction(submodulePath, index, action))}
            onSubmoduleStashFileDiff={(submodulePath: string, index: number, file: StashFileEntry) =>
                postToExtension(messageForSubmoduleStashFileDiff(submodulePath, index, file))}
        />
    );
}

function postToExtension(message: ChangesWebviewToExtensionMessage): void {
    vscodeApi.postMessage(message);
}
