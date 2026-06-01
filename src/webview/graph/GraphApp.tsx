import { useCallback, useEffect, useReducer } from 'react';
import type { GraphExtensionToWebviewMessage } from '../../protocol/graph/messages';
import type { CommitFileChange } from '../../protocol/graph/types';
import { BranchPanel } from '../features/graph/BranchPanel';
import { CommitDetailsPanel } from '../features/graph/CommitDetailsPanel';
import { GraphTable } from '../features/graph/GraphTable';
import { GraphToolbar } from '../features/graph/GraphToolbar';
import {
    createInitialGraphState,
    reduceGraphState,
} from '../features/graph/graphState';
import {
    messageForCommitDetails,
    messageForGraphDataRequest,
    messageForLoadMore,
    messageForOpenDiff,
    messageForWorktreeCommand,
} from '../features/graph/graphCommands';
import { ErrorNotice } from '../shared/ErrorNotice';
import { vscodeApi } from '../platform/vscodeHost';

const PAGE_LIMIT = 300;

export function GraphApp() {
    const [state, dispatch] = useReducer(reduceGraphState, undefined, createInitialGraphState);

    useEffect(() => {
        const onMessage = (event: MessageEvent<GraphExtensionToWebviewMessage>) => {
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        vscodeApi.postMessage({ type: 'graph/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        if (!state.selectedHash) { return; }
        vscodeApi.postMessage(messageForCommitDetails(state.selectedHash));
    }, [state.selectedHash]);

    useEffect(() => {
        if (!state.loading) { return; }
        const repoId = state.repoId ?? 'default';
        vscodeApi.postMessage(messageForGraphDataRequest(
            repoId,
            state.filters,
            { offset: 0, limit: PAGE_LIMIT },
        ));
    }, [state.filters, state.loading, state.repoId]);

    const handleLoadMore = useCallback(() => {
        if (!state.hasMore || state.loading || state.loadingMore) { return; }
        dispatch({ type: 'startLoadMore' });
        const repoId = state.repoId ?? 'default';
        vscodeApi.postMessage(messageForLoadMore(
            repoId,
            state.filters,
            { offset: state.loadedCount, limit: PAGE_LIMIT },
        ));
    }, [state.hasMore, state.loading, state.loadingMore, state.repoId, state.filters, state.loadedCount]);

    const handleDiff = useCallback((file: CommitFileChange) => {
        if (!state.selectedHash) { return; }
        vscodeApi.postMessage(messageForOpenDiff(
            file.filePath,
            state.selectedHash,
            file.status,
            file.origPath,
            file.parentHash,
        ));
    }, [state.selectedHash]);

    return (
        <div className="graph-shell">
            <BranchPanel
                branches={state.branches}
                worktrees={state.worktrees}
                currentBranch={state.currentBranch}
                selectedBranchFilter={state.selectedBranchFilter}
                onSelectBranch={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                onOpenWorktree={(path) => vscodeApi.postMessage(messageForWorktreeCommand('open', path))}
                onAddWorktree={() => vscodeApi.postMessage(messageForWorktreeCommand('add'))}
            />

            <div className="graph-center">
                <GraphToolbar
                    filters={state.filters}
                    branches={state.branches}
                    selectedBranchFilter={state.selectedBranchFilter}
                    onFiltersChange={(filters) => dispatch({ type: 'setFilters', filters })}
                    onBranchFilterChange={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                    onRefresh={() => vscodeApi.postMessage({ type: 'graph/refresh' })}
                />

                <ErrorNotice error={state.error} />

                {state.loading && state.rows.length === 0 ? (
                    <div className="graph-loading">
                        <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                        <span>Loading graph…</span>
                    </div>
                ) : null}

                <GraphTable
                    rows={state.rows}
                    branches={state.branches}
                    maxLane={state.maxLane}
                    selectedHash={state.selectedHash}
                    hasMore={state.hasMore}
                    loadingMore={state.loadingMore}
                    onSelectCommit={(hash) => dispatch({ type: 'selectCommit', hash })}
                    onLoadMore={handleLoadMore}
                    onPostMessage={(msg) => vscodeApi.postMessage(msg)}
                />
            </div>

            {state.selectedHash ? (
                <CommitDetailsPanel
                    details={state.commitDetails}
                    loading={state.detailsLoading}
                    onClose={() => dispatch({ type: 'clearSelection' })}
                    onDiff={handleDiff}
                />
            ) : null}
        </div>
    );
}
