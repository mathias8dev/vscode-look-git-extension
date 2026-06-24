import { useEffect, useReducer } from 'react';
import type { ChangesExtensionToWebviewMessage, ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import type { CommitMode, StashFileEntry } from '@protocol/changes/types';
import { OperationStatus } from '@protocol/shared/operation';
import {
    messageForBulkAction,
    messageForChangesToolbarCommand,
    messageForExplainRepositoryChanges,
    messageForExplainSelection,
    messageForRowAction,
    type ChangeBulkAction,
    type ChangeRowAction,
} from '@webview/features/changes/change-commands';
import type { ChangeListItem, ChangeSection, ChangeSectionId } from '@webview/features/changes/change-tree';
import { messageForGenerateCommitMessage, messageForGenerateSubmoduleCommitMessage } from '@webview/features/changes/commit-message-commands';
import { ChangesApp } from '@webview/features/changes/changes-app';
import {
    createInitialChangesState,
    reduceChangesState,
    submoduleStashKey,
    type ChangeSelectionMode,
} from '@webview/features/changes/changes-state';
import { changesStateToPersisted, readChangesStatePreferences } from '@webview/features/changes/changes-persistence';
import { messageForOperationAction, type ActiveConflictState, type OperationAction } from '@webview/features/changes/operation-commands';
import { changesSelectionTarget } from '@webview/features/changes/change-selection-model';
import { messageForSelectionAction, ChangeSelectionAction } from '@webview/features/changes/selection-commands';
import {
    messageForCreateStash,
    messageForStashAction,
    messageForStashFileDiff,
    StashEntryAction,
    type CreateStashKind,
} from '@webview/features/changes/stash-commands';
import {
    messageForChangesContextTarget,
    messageForSubmoduleAction,
    messageForSubmoduleBulkAction,
    messageForSubmoduleCommit,
    messageForSubmoduleOperationAction,
    messageForSubmoduleRowAction,
    messageForSubmoduleStash,
    messageForSubmoduleStashAction,
    messageForSubmoduleStashFileDiff,
    messageForGetSubmoduleStatus,
    submoduleStatusRequestId,
    SubmoduleAction,
} from '@webview/features/changes/submodule-commands';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';
import { vscodeApi } from '@webview/platform/vscode-host';

const COMMIT_FEEDBACK_TIMEOUT_MS = 5000;
const OPERATION_NOTICE_TIMEOUT_MS = 5000;

export function ChangesWebview() {
    const [state, dispatch] = useReducer(
        reduceChangesState,
        readChangesStatePreferences(vscodeApi.getState()),
        createInitialChangesState,
    );

    useEffect(() => {
        const onMessage = (event: MessageEvent<ChangesExtensionToWebviewMessage>) => {
            if (isWebviewFontSizeMessage(event.data)) {
                applyWebviewFontSize(event.data.fontSize);
                return;
            }
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        postToExtension({ type: 'changes/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        vscodeApi.setState(changesStateToPersisted(state));
    }, [state]);

    useEffect(() => {
        if (!state.commitFeedback?.success) { return undefined; }
        const timeout = window.setTimeout(() => dispatch({ type: 'clearCommitFeedback' }), COMMIT_FEEDBACK_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.commitFeedback]);

    useEffect(() => {
        if (!state.operationStatus || state.operationStatus.status !== OperationStatus.Success) { return undefined; }
        const operationId = state.operationStatus.operationId;
        const timeout = window.setTimeout(() => dispatch({ type: 'clearOperationStatus', operationId }), OPERATION_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.operationStatus]);

    useEffect(() => {
        const successfulSubmodulePaths = Object.entries(state.submoduleCommitFeedbackByPath)
            .filter(([, feedback]) => feedback.success)
            .map(([path]) => path);
        if (successfulSubmodulePaths.length === 0) { return undefined; }
        const timeout = window.setTimeout(() => {
            for (const path of successfulSubmodulePaths) {
                dispatch({ type: 'clearSubmoduleCommitFeedback', path });
            }
        }, COMMIT_FEEDBACK_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.submoduleCommitFeedbackByPath]);

    useEffect(() => {
        postToExtension({
            type: 'changes/preferencesChanged',
            viewMode: state.viewMode,
            sortMode: state.sortMode,
        });
    }, [state.viewMode, state.sortMode]);

    useEffect(() => {
        const knownStashIndexes = new Set(state.status.stashes.map((stash) => stash.index));
        for (const index of state.expandedStashIndexes) {
            if (!knownStashIndexes.has(index)) { continue; }
            if (Object.prototype.hasOwnProperty.call(state.stashFilesByIndex, index)) { continue; }
            postToExtension(messageForStashAction(index, StashEntryAction.LoadFiles));
        }
    }, [state.expandedStashIndexes, state.status.stashes, state.stashFilesByIndex]);

    useEffect(() => {
        const knownSubmodulePaths = new Set(state.status.submodules.map((submodule) => submodule.path));
        for (const submodulePath of state.expandedSubmodulePaths) {
            if (!knownSubmodulePaths.has(submodulePath)) { continue; }
            if (state.loadingSubmoduleStatusPaths.includes(submodulePath)) { continue; }
            if (
                Object.prototype.hasOwnProperty.call(state.submoduleStatusByPath, submodulePath)
                && !state.staleSubmoduleStatusPaths.includes(submodulePath)
            ) { continue; }
            dispatch({ type: 'requestSubmoduleStatus', path: submodulePath });
            postToExtension(messageForGetSubmoduleStatus(submodulePath, submoduleStatusRequestId(submodulePath)));
        }
    }, [
        state.expandedSubmodulePaths,
        state.loadingSubmoduleStatusPaths,
        state.status.submodules,
        state.staleSubmoduleStatusPaths,
        state.submoduleStatusByPath,
    ]);

    useEffect(() => {
        for (const [submodulePath, statusData] of Object.entries(state.submoduleStatusByPath)) {
            for (const stash of statusData.stashes) {
                const key = submoduleStashKey(submodulePath, stash.index);
                if (!state.expandedSubmoduleStashKeys.includes(key)) { continue; }
                if (Object.prototype.hasOwnProperty.call(state.submoduleStashFilesByKey, key)) { continue; }
                postToExtension(messageForSubmoduleStashAction(submodulePath, stash.index, StashEntryAction.LoadFiles));
            }
        }
    }, [state.expandedSubmoduleStashKeys, state.submoduleStatusByPath, state.submoduleStashFilesByKey]);

    const toggleStash = (index: number) => {
        dispatch({ type: 'toggleStash', index });
    };

    const toggleSubmodule = (submodulePath: string) => {
        dispatch({ type: 'toggleSubmodule', path: submodulePath });
    };

    const toggleSubmoduleStash = (submodulePath: string, index: number) => {
        const key = submoduleStashKey(submodulePath, index);
        dispatch({ type: 'toggleSubmoduleStash', key });
    };

    const handleSubmoduleAction = (path: string, action: SubmoduleAction) => {
        if (action === SubmoduleAction.Refresh) {
            dispatch({ type: 'requestSubmoduleStatus', path });
        }
        postToExtension(messageForSubmoduleAction(path, action));
    };

    return (
        <ChangesApp
            state={state}
            onSectionToggle={(sectionId: ChangeSectionId) => dispatch({ type: 'toggleSection', sectionId })}
            onSelectItem={(item: ChangeListItem, mode: ChangeSelectionMode, visibleItemIds: readonly string[]) => {
                dispatch({ type: 'selectChange', selection: { itemId: item.id, mode, visibleItemIds } });
            }}
            onRowAction={(item: ChangeListItem, action: ChangeRowAction) => postToExtension(messageForRowAction(item, action))}
            onBulkAction={(section: ChangeSection, action: ChangeBulkAction) => postToExtension(messageForBulkAction(section, action))}
            onExplainSelection={(target) => postToExtension(messageForExplainSelection(target))}
            onSelectionContextTarget={(target) => postToExtension(messageForChangesContextTarget(target))}
            onSelectionAction={(items, action) => {
                if (action === ChangeSelectionAction.CreatePatch) {
                    postToExtension({ type: 'changes/createPatchFromSelection', target: changesSelectionTarget(items) });
                    return;
                }
                const message = messageForSelectionAction(items, action);
                if (message) { postToExtension(message); }
            }}
            onClearSelection={() => dispatch({ type: 'clearSelection' })}
            onCommit={(message: string, mode: CommitMode) => {
                dispatch({ type: 'rememberCommitMessage', message });
                postToExtension({ type: 'changes/commit', message, mode });
            }}
            onCommitComposerContextTarget={(message: string) => postToExtension(messageForChangesContextTarget({
                kind: 'commitComposer',
                message,
            }))}
            onGenerateCommitMessage={() => {
                const message = messageForGenerateCommitMessage();
                dispatch({ type: 'requestCommitMessageGeneration', requestId: message.requestId });
                postToExtension(message);
            }}
            onClearPathFilter={() => dispatch({ type: 'setPathFilter', pathFilter: '' })}
            onToggleShowConflictsOnly={(showConflictsOnly: boolean) =>
                dispatch({ type: 'setShowConflictsOnly', showConflictsOnly })}
            onOperationAction={(conflictState: ActiveConflictState, action: OperationAction) => {
                postToExtension(messageForOperationAction(conflictState, action));
            }}
            onShowErrorOutput={() => postToExtension(messageForChangesToolbarCommand('showGitOutput'))}
            onDismissError={() => dispatch({ type: 'clearError' })}
            onShowOperationOutput={() => postToExtension(messageForChangesToolbarCommand('showGitOutput'))}
            onDismissOperation={() => {
                if (state.operationStatus) {
                    dispatch({ type: 'clearOperationStatus', operationId: state.operationStatus.operationId });
                }
            }}
            onCreateStash={(kind: CreateStashKind, message: string) => postToExtension(messageForCreateStash(kind, message))}
            onToggleStash={toggleStash}
            onStashAction={(index: number, action: StashEntryAction) => postToExtension(messageForStashAction(index, action))}
            onStashFileDiff={(index: number, file: StashFileEntry) => postToExtension(messageForStashFileDiff(index, file))}
            onToggleSubmodule={toggleSubmodule}
            onSubmoduleContextTarget={(path: string) => postToExtension(messageForChangesContextTarget({
                kind: 'submoduleToolbar',
                submodulePath: path,
            }))}
            onSubmoduleAction={handleSubmoduleAction}
            onSubmoduleRowAction={(submodulePath: string, item: ChangeListItem, action: ChangeRowAction) =>
                postToExtension(messageForSubmoduleRowAction(submodulePath, item.entry, item.isStaged, action))}
            onSubmoduleBulkAction={(submodulePath: string, section: ChangeSection, action: ChangeBulkAction) =>
                postToExtension(messageForSubmoduleBulkAction(submodulePath, section, action))}
            onExplainSubmoduleChanges={(submodulePath: string) =>
                postToExtension(messageForExplainRepositoryChanges(submodulePath))}
            onExplainSubmoduleSelection={(target) => postToExtension(messageForExplainSelection(target))}
            onSubmoduleSelectionContextTarget={(target) => postToExtension(messageForChangesContextTarget(target))}
            onSubmoduleOperationAction={(submodulePath: string, conflictState: ActiveConflictState, action: OperationAction) =>
                postToExtension(messageForSubmoduleOperationAction(submodulePath, conflictState, action))}
            onSubmoduleCommit={(submodulePath: string, message: string, mode: CommitMode) => {
                dispatch({ type: 'rememberCommitMessage', message });
                dispatch({ type: 'clearSubmoduleCommitMessageGeneration', path: submodulePath });
                postToExtension(messageForSubmoduleCommit(submodulePath, message, mode));
            }}
            onSubmoduleCommitComposerContextTarget={(submodulePath: string, message: string) => postToExtension(messageForChangesContextTarget({
                kind: 'commitComposer',
                submodulePath,
                message,
            }))}
            onGenerateCommitMessageForSubmodule={(submodulePath: string) => {
                const message = messageForGenerateSubmoduleCommitMessage(submodulePath);
                dispatch({
                    type: 'requestSubmoduleCommitMessageGeneration',
                    path: submodulePath,
                    requestId: message.requestId,
                });
                postToExtension(message);
            }}
            onSubmoduleCreateStash={(submodulePath: string, message: string) =>
                postToExtension(messageForSubmoduleStash(submodulePath, message))}
            onToggleSubmoduleStash={toggleSubmoduleStash}
            onSubmoduleStashAction={(submodulePath: string, index: number, action: StashEntryAction) =>
                postToExtension(messageForSubmoduleStashAction(submodulePath, index, action))}
            onSubmoduleStashFileDiff={(submodulePath: string, index: number, file: StashFileEntry) =>
                postToExtension(messageForSubmoduleStashFileDiff(submodulePath, index, file))}
            onRepositoryNavigate={(contextId) => {
                dispatch({ type: 'selectRepositoryContext', contextId });
                postToExtension({ type: 'repo/selectRepository', contextId });
            }}
            onRepositoryList={(contextId) => {
                dispatch({ type: 'showRepositoryList', contextId });
                postToExtension({ type: 'repo/showRepositoryList', ...(contextId ? { contextId } : {}) });
            }}
            onOpenRepositoryInNewWindow={(contextId) => postToExtension({ type: 'repo/openRepositoryInNewWindow', contextId })}
        />
    );
}

function postToExtension(message: ChangesWebviewToExtensionMessage): void {
    vscodeApi.postMessage(message);
}
