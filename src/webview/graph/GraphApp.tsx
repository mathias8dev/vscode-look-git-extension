import { useCallback, useEffect, useReducer } from 'react';
import type { GraphExtensionToWebviewMessage } from '../../protocol/graph/messages';
import type { CommitFileChange, GraphContextTarget, GraphRepositoryScope } from '../../protocol/graph/types';
import { BranchPanel } from '../features/graph/BranchPanel';
import { CommitDetailsPanel } from '../features/graph/CommitDetailsPanel';
import { GraphTable } from '../features/graph/GraphTable';
import { GraphToolbar } from '../features/graph/GraphToolbar';
import { GraphOperationNotice } from '../features/graph/GraphOperationNotice';
import { GraphEmptyState } from '../features/graph/GraphEmptyState';
import {
    createInitialGraphState,
    reduceGraphState,
} from '../features/graph/graphState';
import { graphEmptyStateModel } from '../features/graph/graphEmptyStateModel';
import {
    messageForCommitDetails,
    messageForGraphDataRequest,
    messageForGraphContextTarget,
    messageForLoadMore,
    messageForOpenDiff,
    messageForOpenWorktreeDiff,
    messageForBranchCommand,
    messageForGraphRepositoryCommand,
    messageForWorktreeCommand,
    messageForWorktreeDetails,
    messageForBranchCheckout,
} from '../features/graph/graphCommands';
import { ErrorNotice } from '../shared/ErrorNotice';
import { GraphOperationStatus } from '../../protocol/graph/messages';
import { ResizablePanel } from '../shared/ResizablePanel';
import { ResizeAxis } from '../shared/resizeAxis';
import { ResizeHandleSide } from '../shared/resizeHandleSide';
import { vscodeApi } from '../platform/vscodeHost';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '../platform/font-size';

const PAGE_LIMIT = 300;
const ERROR_NOTICE_TIMEOUT_MS = 8000;
const OPERATION_NOTICE_TIMEOUT_MS = 5000;
const BRANCH_PANEL_MIN = 120;
const BRANCH_PANEL_MAX = 960;
const BRANCH_PANEL_DEFAULT = 260;
const BRANCH_PANEL_STORAGE_KEY = 'lookGit.branchPanelWidth';
const DETAILS_PANEL_MIN = 180;
const DETAILS_PANEL_MAX = 720;
const DETAILS_PANEL_DEFAULT = 320;
const DETAILS_PANEL_STORAGE_KEY = 'lookGit.commitDetailsPanelWidth';

export function GraphApp() {
    const [state, dispatch] = useReducer(reduceGraphState, undefined, createInitialGraphState);
    const scopeAnimationKey = graphScopeAnimationKey(state.repositoryScope);
    const showGraphEmptyState = !state.loading && state.displayRows.length === 0 && !state.hasMore;
    const emptyState = graphEmptyStateModel({
        filters: state.filters,
        selectedBranchFilter: state.selectedBranchFilter,
        repositoryScope: state.repositoryScope,
    });

    useEffect(() => {
        const onMessage = (event: MessageEvent<GraphExtensionToWebviewMessage>) => {
            if (isWebviewFontSizeMessage(event.data)) {
                applyWebviewFontSize(event.data.fontSize);
                return;
            }
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        vscodeApi.postMessage({ type: 'graph/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        if (!state.selectedHash) { return; }
        vscodeApi.postMessage(messageForCommitDetails(state.selectedHash, state.repositoryScope));
    }, [state.repositoryScope, state.selectedHash]);

    useEffect(() => {
        if (!state.selectedWorktreePath) { return; }
        vscodeApi.postMessage(messageForWorktreeDetails(state.selectedWorktreePath, state.repositoryScope));
    }, [state.repositoryScope, state.selectedWorktreePath]);

    useEffect(() => {
        if (!state.loading || !state.activeGraphRequestId) { return; }
        const repoId = state.repoId ?? 'default';
        const limit = Math.max(PAGE_LIMIT, state.loadedCount || PAGE_LIMIT);
        const message = messageForGraphDataRequest(
            repoId,
            state.filters,
            { offset: 0, limit },
            state.repositoryScope,
            state.activeGraphRequestId,
        );
        vscodeApi.postMessage(message);
    }, [state.activeGraphRequestId, state.filters, state.loading, state.repoId, state.loadedCount, state.repositoryScope]);

    useEffect(() => {
        if (!state.loadingMore || !state.activeGraphRequestId) { return; }
        const repoId = state.repoId ?? 'default';
        vscodeApi.postMessage(messageForLoadMore(
            repoId,
            state.filters,
            { offset: state.loadedCount, limit: PAGE_LIMIT },
            state.repositoryScope,
            state.activeGraphRequestId,
        ));
    }, [state.activeGraphRequestId, state.filters, state.loadedCount, state.loadingMore, state.repoId, state.repositoryScope]);

    useEffect(() => {
        if (!state.error) { return; }
        const timeout = window.setTimeout(() => dispatch({ type: 'clearError' }), ERROR_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.error]);

    useEffect(() => {
        if (!state.operationStatus || state.operationStatus.status !== GraphOperationStatus.Success) { return; }
        const operationId = state.operationStatus.operationId;
        const timeout = window.setTimeout(() => dispatch({ type: 'clearOperationStatus', operationId }), OPERATION_NOTICE_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
    }, [state.operationStatus]);

    const handleLoadMore = useCallback(() => {
        if (!state.hasMore || state.loading || state.loadingMore) { return; }
        dispatch({ type: 'startLoadMore' });
    }, [state.hasMore, state.loading, state.loadingMore]);

    const handleDiff = useCallback((file: CommitFileChange) => {
        if (state.commitDetails?.kind === 'worktree' && state.commitDetails.path) {
            vscodeApi.postMessage(messageForOpenWorktreeDiff(
                state.commitDetails.path,
                file.filePath,
                file.status,
                file.origPath,
                file.isSubmodule,
                state.repositoryScope,
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
            file.isSubmodule,
            state.repositoryScope,
        ));
    }, [state.commitDetails, state.repositoryScope, state.selectedHash]);

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
        vscodeApi.postMessage(messageForGraphContextTarget(contextTargetForScope(target, state.repositoryScope)));
    }, [state.repositoryScope]);

    const handleMoveGraphFocus = useCallback((currentHash: string, direction: 'previous' | 'next', mode?: 'replace' | 'toggle' | 'range') => {
        const hashes = state.rows.map((row) => row.commit.hash);
        const currentIndex = hashes.indexOf(currentHash);
        const nextHash = direction === 'next' ? hashes[currentIndex + 1] : hashes[currentIndex - 1];
        if (!nextHash) { return; }
        document.querySelector<HTMLElement>(`[data-graph-commit-hash="${nextHash}"]`)?.focus();
        if (mode) { handleSelectCommit(nextHash, mode); }
    }, [handleSelectCommit, state.rows]);

    return (
        <div className="graph-shell">
            <ResizablePanel
                storageKey={BRANCH_PANEL_STORAGE_KEY}
                defaultSize={BRANCH_PANEL_DEFAULT}
                minSize={BRANCH_PANEL_MIN}
                maxSize={BRANCH_PANEL_MAX}
                axis={ResizeAxis.Horizontal}
                handleSide={ResizeHandleSide.End}
                ariaLabel="Resize branches panel"
                title="Drag or use arrow keys to resize branches panel"
            >
                {(style) => (
                    <BranchPanel
                        key={`branch-panel:${scopeAnimationKey}`}
                        style={style}
                        branches={state.branches}
                        worktrees={state.worktrees}
                        submodules={state.submodules}
                        repositoryScope={state.repositoryScope}
                        currentBranch={state.currentBranch}
                        hasRemotes={state.hasRemotes}
                        selectedBranchFilter={state.selectedBranchFilter}
                        selectedWorktreePath={state.selectedWorktreePath}
                        operationStatus={state.operationStatus}
                        onSelectBranch={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                        onSelectMainRepository={() => dispatch({ type: 'selectMainRepository' })}
                        onSelectSubmodule={(submodulePath, submoduleLabel) => dispatch({ type: 'selectSubmodule', submodulePath, submoduleLabel })}
                        onBranchCommand={(command, branch, isRemote) => vscodeApi.postMessage(messageForBranchCommand(command, branch, isRemote, state.repositoryScope))}
                        onFetch={() => vscodeApi.postMessage(messageForGraphRepositoryCommand('fetch', state.repositoryScope))}
                        onSelectWorktree={handleSelectWorktree}
                        onOpenWorktree={(path) => vscodeApi.postMessage(messageForWorktreeCommand('openInNewWindow', path, state.repositoryScope))}
                        onAddWorktree={() => vscodeApi.postMessage(messageForWorktreeCommand('add', undefined, state.repositoryScope))}
                        onContextTarget={handleContextTarget}
                    />
                )}
            </ResizablePanel>

            <div className="graph-center">
                <div key={`graph-scope:${scopeAnimationKey}`} className="graph-scope-content graph-scope-transition-surface">
                    <GraphToolbar
                        filters={state.filters}
                        branches={state.branches}
                        selectedBranchFilter={state.selectedBranchFilter}
                        refreshing={state.loading && state.rows.length > 0}
                        onFiltersChange={(filters) => dispatch({ type: 'setFilters', filters })}
                        onBranchFilterChange={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                        onRefresh={() => dispatch({ type: 'refreshRequested' })}
                    />

                    <GraphOperationNotice
                        operation={state.operationStatus}
                        onShowOutput={() => vscodeApi.postMessage({ type: 'graph/showOutput' })}
                        onDismiss={() => {
                            if (state.operationStatus) {
                                dispatch({ type: 'clearOperationStatus', operationId: state.operationStatus.operationId });
                            }
                        }}
                    />

                    <ErrorNotice
                        error={state.error}
                        primaryAction={{ label: 'Retry', onClick: () => dispatch({ type: 'refreshRequested' }) }}
                        secondaryAction={state.error?.details ? { label: 'Show Output', onClick: () => vscodeApi.postMessage({ type: 'graph/showOutput' }) } : undefined}
                    />

                    {state.loading && state.rows.length === 0 ? (
                        <div className="graph-loading">
                            <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                            <span>Loading graph…</span>
                        </div>
                    ) : null}

                    {showGraphEmptyState ? (
                        <GraphEmptyState
                            title={emptyState.title}
                            subtitle={emptyState.subtitle}
                            actionLabel={emptyState.actionLabel}
                            onAction={emptyState.actionLabel ? () => dispatch({ type: 'clearFilters' }) : undefined}
                        />
                    ) : null}

                    {!showGraphEmptyState && (!state.loading || state.displayRows.length > 0 || state.hasMore) ? (
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
                            onBranchDoubleClick={(branch, isRemote) => vscodeApi.postMessage(messageForBranchCheckout(branch, isRemote, state.repositoryScope))}
                            onMoveFocus={handleMoveGraphFocus}
                        />
                    ) : null}
                </div>
            </div>

            {state.selectedHash || state.selectedWorktreePath ? (
                <ResizablePanel
                    storageKey={DETAILS_PANEL_STORAGE_KEY}
                    defaultSize={DETAILS_PANEL_DEFAULT}
                    minSize={DETAILS_PANEL_MIN}
                    maxSize={DETAILS_PANEL_MAX}
                    axis={ResizeAxis.Horizontal}
                    handleSide={ResizeHandleSide.Start}
                    ariaLabel="Resize commit details panel"
                    title="Drag or use arrow keys to resize commit details panel"
                >
                    {(style) => (
                        <CommitDetailsPanel
                            style={style}
                            details={state.commitDetails}
                            loading={state.detailsLoading}
                            onClose={() => dispatch({ type: 'clearSelection' })}
                            onDiff={handleDiff}
                        />
                    )}
                </ResizablePanel>
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

function contextTargetForScope(target: GraphContextTarget, repositoryScope: GraphRepositoryScope): GraphContextTarget {
    if (repositoryScope.kind === 'main') { return target; }
    return { ...target, repositoryScope };
}

function graphScopeAnimationKey(repositoryScope: GraphRepositoryScope): string {
    if (repositoryScope.kind === 'main') { return 'main'; }
    return `submodule:${repositoryScope.path ?? repositoryScope.label ?? ''}`;
}
