import { useCallback, useEffect, useReducer } from 'react';
import type { GraphExtensionToWebviewMessage } from '../../protocol/graph/messages';
import type { CommitFileChange, GraphContextTarget } from '../../protocol/graph/types';
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
    messageForGraphContextTarget,
    messageForLoadMore,
    messageForOpenDiff,
    messageForOpenWorktreeDiff,
    messageForWorktreeCommand,
    messageForWorktreeDetails,
} from '../features/graph/graphCommands';
import { ErrorNotice } from '../shared/ErrorNotice';
import { vscodeApi } from '../platform/vscodeHost';

const PAGE_LIMIT = 300;
const ERROR_NOTICE_TIMEOUT_MS = 8000;

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
        if (!state.selectedWorktreePath) { return; }
        vscodeApi.postMessage(messageForWorktreeDetails(state.selectedWorktreePath));
    }, [state.selectedWorktreePath]);

    useEffect(() => {
        if (!state.loading) { return; }
        const repoId = state.repoId ?? 'default';
        const limit = Math.max(PAGE_LIMIT, state.loadedCount || PAGE_LIMIT);
        vscodeApi.postMessage(messageForGraphDataRequest(
            repoId,
            state.filters,
            { offset: 0, limit },
        ));
    }, [state.filters, state.loading, state.repoId, state.loadedCount, state.refreshVersion]);

    useEffect(() => {
        if (!state.error) { return; }
        const timeout = window.setTimeout(() => dispatch({ type: 'clearError' }), ERROR_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.error]);

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
        if (state.commitDetails?.kind === 'worktree' && state.commitDetails.path) {
            vscodeApi.postMessage(messageForOpenWorktreeDiff(
                state.commitDetails.path,
                file.filePath,
                file.status,
                file.origPath,
            ));
            return;
        }
        if (!state.selectedHash) { return; }
        vscodeApi.postMessage(messageForOpenDiff(
            file.filePath,
            state.selectedHash,
            file.status,
            file.origPath,
            file.parentHash,
        ));
    }, [state.commitDetails, state.selectedHash]);

    const handleSelectCommit = useCallback((hash: string, mode: 'replace' | 'toggle' | 'range') => {
        if (mode === 'toggle') {
            dispatch({ type: 'toggleCommitSelection', hash });
            return;
        }
        if (mode === 'range') {
            dispatch({ type: 'selectCommitRange', focusHash: hash, hashes: selectedRangeHashes(state.rows.map((row) => row.commit.hash), state.selectionAnchorHash ?? hash, hash) });
            return;
        }
        dispatch({ type: 'selectCommit', hash });
    }, [state.rows, state.selectionAnchorHash]);

    const handleSelectWorktree = useCallback((path: string) => {
        dispatch({ type: 'selectWorktree', path });
    }, []);

    const handleContextTarget = useCallback((target: GraphContextTarget) => {
        vscodeApi.postMessage(messageForGraphContextTarget(target));
    }, []);

    return (
        <div className="graph-shell">
            <BranchPanel
                branches={state.branches}
                worktrees={state.worktrees}
                currentBranch={state.currentBranch}
                selectedBranchFilter={state.selectedBranchFilter}
                selectedWorktreePath={state.selectedWorktreePath}
                onSelectBranch={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                onSelectWorktree={handleSelectWorktree}
                onOpenWorktree={(path) => vscodeApi.postMessage(messageForWorktreeCommand('openInNewWindow', path))}
                onAddWorktree={() => vscodeApi.postMessage(messageForWorktreeCommand('add'))}
                onContextTarget={handleContextTarget}
            />

            <div className="graph-center">
                <GraphToolbar
                    filters={state.filters}
                    branches={state.branches}
                    selectedBranchFilter={state.selectedBranchFilter}
                    onFiltersChange={(filters) => dispatch({ type: 'setFilters', filters })}
                    onBranchFilterChange={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                    onRefresh={() => dispatch({ type: 'refreshRequested' })}
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
                    displayRows={state.displayRows}
                    branches={state.branches}
                    selectedHashes={state.selectedHashes}
                    selectedWorktreePath={state.selectedWorktreePath}
                    hasMore={state.hasMore}
                    loadingMore={state.loadingMore}
                    onSelectCommit={handleSelectCommit}
                    onSelectWorktree={handleSelectWorktree}
                    onContextTarget={handleContextTarget}
                    onLoadMore={handleLoadMore}
                    onPostMessage={(msg) => vscodeApi.postMessage(msg)}
                />
            </div>

            {state.selectedHash || state.selectedWorktreePath ? (
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

function selectedRangeHashes(hashes: readonly string[], anchorHash: string, focusHash: string): readonly string[] {
    const anchorIndex = hashes.indexOf(anchorHash);
    const focusIndex = hashes.indexOf(focusHash);
    if (anchorIndex === -1 || focusIndex === -1) { return [focusHash]; }
    const start = Math.min(anchorIndex, focusIndex);
    const end = Math.max(anchorIndex, focusIndex);
    return hashes.slice(start, end + 1);
}
