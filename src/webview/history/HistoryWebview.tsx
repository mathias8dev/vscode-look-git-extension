import { useCallback, useEffect, useReducer, useState } from 'react';
import type { HistoryExtensionToWebviewMessage } from '../../protocol/history/messages';
import type { HistoryCommitFile, HistoryContextTarget } from '../../protocol/history/types';
import { OperationStatus } from '../../protocol/shared/operation';
import { CommitHistoryApp } from '../features/history/CommitHistoryApp';
import { createInitialHistoryState, reduceHistoryState } from '../features/history/historyState';
import { messageForHistoryCommitDetails, messageForHistoryContextTarget, messageForHistoryDataRequest, messageForHistoryOpenDiff, messageForHistoryReady, messageForHistoryShowOutput } from '../features/history/historyCommands';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '../platform/font-size';
import { vscodeApi } from '../platform/vscodeHost';

const PAGE_LIMIT = 50;
const ERROR_NOTICE_TIMEOUT_MS = 8000;
const OPERATION_NOTICE_TIMEOUT_MS = 5000;

export function HistoryWebview() {
    const [state, dispatch] = useReducer(reduceHistoryState, undefined, createInitialHistoryState);
    const [query, setQuery] = useState('');
    const [fileViewMode, setFileViewMode] = useState<'list' | 'tree'>('tree');

    useEffect(() => {
        const onMessage = (event: MessageEvent<HistoryExtensionToWebviewMessage>) => {
            if (isWebviewFontSizeMessage(event.data)) {
                applyWebviewFontSize(event.data.fontSize);
                return;
            }
            if (event.data.type === 'history/applyFileViewMode') {
                setFileViewMode(event.data.mode);
                return;
            }
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        vscodeApi.postMessage(messageForHistoryReady());
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        if (!state.error) { return; }
        const timeout = window.setTimeout(() => dispatch({ type: 'clearError' }), ERROR_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.error]);

    useEffect(() => {
        if (!state.operationStatus || state.operationStatus.status !== OperationStatus.Success) { return undefined; }
        const operationId = state.operationStatus.operationId;
        const timeout = window.setTimeout(() => dispatch({ type: 'clearOperationStatus', operationId }), OPERATION_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.operationStatus]);

    useEffect(() => {
        const pending = state.expandedHashes.find(
            (h) => !state.detailsByHash[h] && state.detailsLoadingHash !== h,
        );
        if (!pending) { return; }
        dispatch({ type: 'startLoadingDetails', hash: pending });
        vscodeApi.postMessage(messageForHistoryCommitDetails(pending));
    }, [state.expandedHashes, state.detailsByHash, state.detailsLoadingHash]);

    const handleLoadMore = useCallback(() => {
        if (!state.hasMore || state.loading || state.loadingMore) { return; }
        dispatch({ type: 'startLoadMore' });
        vscodeApi.postMessage(messageForHistoryDataRequest({
            offset: state.loadedCount,
            limit: PAGE_LIMIT,
        }));
    }, [state.hasMore, state.loading, state.loadingMore, state.loadedCount]);

    const handleOpenFileDiff = useCallback((hash: string, file: HistoryCommitFile) => {
        vscodeApi.postMessage(messageForHistoryOpenDiff(hash, file));
    }, []);

    const handleContextTarget = useCallback((target: HistoryContextTarget) => {
        vscodeApi.postMessage(messageForHistoryContextTarget(target));
    }, []);

    return (
        <CommitHistoryApp
            state={state}
            query={query}
            fileViewMode={fileViewMode}
            onQueryChange={setQuery}
            onToggleCommit={(hash: string) => dispatch({ type: 'toggleCommit', hash })}
            onSelectCommit={(hash, mode, visibleHashes) => dispatch({ type: 'selectCommit', hash, mode, visibleHashes })}
            onOpenFileDiff={handleOpenFileDiff}
            onContextTarget={handleContextTarget}
            onLoadMore={handleLoadMore}
            onCopyHash={(hash) => navigator.clipboard.writeText(hash).catch(() => {})}
            onShowOperationOutput={() => vscodeApi.postMessage(messageForHistoryShowOutput())}
            onDismissOperation={() => {
                if (state.operationStatus) {
                    dispatch({ type: 'clearOperationStatus', operationId: state.operationStatus.operationId });
                }
            }}
        />
    );
}
