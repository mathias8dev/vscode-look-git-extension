import { useCallback, useEffect, useReducer, useState } from 'react';
import type { HistoryExtensionToWebviewMessage } from '../../protocol/history/messages';
import type { HistoryCommitFile, HistoryContextTarget } from '../../protocol/history/types';
import { CommitHistoryApp } from '../features/history/CommitHistoryApp';
import { createInitialHistoryState, reduceHistoryState } from '../features/history/historyState';
import { messageForHistoryCommitDetails, messageForHistoryContextTarget, messageForHistoryDataRequest, messageForHistoryOpenDiff, messageForHistoryReady, messageForHistoryRefresh, messageForHistoryToolbarCommand } from '../features/history/historyCommands';
import { vscodeApi } from '../platform/vscodeHost';

const PAGE_LIMIT = 50;
const ERROR_NOTICE_TIMEOUT_MS = 8000;

export function HistoryWebview() {
    const [state, dispatch] = useReducer(reduceHistoryState, undefined, createInitialHistoryState);
    const [query, setQuery] = useState('');
    const [fileViewMode, setFileViewMode] = useState<'list' | 'tree'>('tree');

    useEffect(() => {
        const onMessage = (event: MessageEvent<HistoryExtensionToWebviewMessage>) => {
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
        if (!state.selectedHash || state.detailsByHash[state.selectedHash]) { return; }
        vscodeApi.postMessage(messageForHistoryCommitDetails(state.selectedHash));
    }, [state.selectedHash, state.detailsByHash]);

    const handleRefresh = useCallback(() => {
        dispatch({ type: 'startRefresh' });
        vscodeApi.postMessage(messageForHistoryRefresh());
    }, []);

    const handleLoadMore = useCallback(() => {
        if (!state.hasMore || state.loading || state.loadingMore) { return; }
        dispatch({ type: 'startLoadMore' });
        vscodeApi.postMessage(messageForHistoryDataRequest({
            offset: state.loadedCount,
            limit: PAGE_LIMIT,
        }));
    }, [state.hasMore, state.loading, state.loadingMore, state.loadedCount]);

    const handleOpenFileDiff = useCallback((hash: string, file: HistoryCommitFile) => {
        if (file.isSubmodule) { return; }
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
            onRefresh={handleRefresh}
            onToolbarCommand={(command) => vscodeApi.postMessage(messageForHistoryToolbarCommand(command))}
            onFileViewModeChange={setFileViewMode}
            onSelectCommit={(hash) => dispatch({ type: 'selectCommit', hash })}
            onOpenFileDiff={handleOpenFileDiff}
            onContextTarget={handleContextTarget}
            onLoadMore={handleLoadMore}
        />
    );
}
