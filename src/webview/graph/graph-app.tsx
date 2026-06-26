import { useCallback, useEffect, useReducer } from 'react';
import type { GraphExtensionToWebviewMessage, GraphWebviewToExtensionMessage } from '@protocol/graph/messages';
import type { CommitFileChange, GraphContextTarget, GraphSubmoduleInfo } from '@protocol/graph/types';
import type { RepositoryLocator } from '@protocol/shared/repo';
import { BranchPanel } from '@webview/features/graph/branch-panel';
import { CommitDetailsPanel } from '@webview/features/graph/commit-details-panel';
import { GraphTable } from '@webview/features/graph/graph-table';
import { GraphToolbar } from '@webview/features/graph/graph-toolbar';
import { GraphOperationNotice } from '@webview/features/graph/graph-operation-notice';
import { GraphEmptyState } from '@webview/features/graph/graph-empty-state';
import {
    createInitialGraphState,
    reduceGraphState,
} from '@webview/features/graph/graph-state';
import { graphEmptyStateModel } from '@webview/features/graph/graph-empty-state-model';
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
} from '@webview/features/graph/graph-commands';
import { ErrorNotice } from '@webview/shared/error-notice';
import { GraphOperationStatus } from '@protocol/graph/messages';
import { graphRepositorySelectionKey } from '@webview/features/graph/graph-repository-selection';
import { RepositoryNavigator } from '@webview/shared/repository-navigator';
import { ResizablePanel } from '@webview/shared/resizable-panel';
import { ResizeAxis } from '@webview/shared/resize-axis';
import { ResizeHandleSide } from '@webview/shared/resize-handle-side';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';

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

interface GraphAppProps {
    readonly sendMessage: (message: GraphWebviewToExtensionMessage) => void;
}

export function GraphApp({ sendMessage }: GraphAppProps) {
    const [state, dispatch] = useReducer(reduceGraphState, undefined, createInitialGraphState);
    const scopeAnimationKey = graphRepositorySelectionKey(state.selectedRepository);
    const showGraphEmptyState = !state.loading && state.displayRows.length === 0 && !state.hasMore;
    const emptyState = graphEmptyStateModel({
        filters: state.filters,
        selectedBranchFilter: state.selectedBranchFilter,
        selectedRepository: state.selectedRepository,
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
        sendMessage({ type: 'graph/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, [sendMessage]);

    useEffect(() => {
        if (!state.selectedHash) { return; }
        sendMessage(messageForCommitDetails(state.selectedHash, state.repository));
    }, [sendMessage, state.repository, state.selectedHash]);

    useEffect(() => {
        if (!state.selectedWorktreePath) { return; }
        const worktree = state.worktrees.find((candidate) => candidate.path === state.selectedWorktreePath)?.locator;
        sendMessage(messageForWorktreeDetails(state.selectedWorktreePath, state.repository, worktree));
    }, [sendMessage, state.repository, state.selectedWorktreePath, state.worktrees]);

    useEffect(() => {
        if (!state.loading || !state.activeGraphRequestId) { return; }
        const limit = Math.max(PAGE_LIMIT, state.loadedCount || PAGE_LIMIT);
        const message = messageForGraphDataRequest(
            state.repoId,
            state.filters,
            { offset: 0, limit },
            state.repository,
            state.activeGraphRequestId,
        );
        sendMessage(message);
    }, [sendMessage, state.activeGraphRequestId, state.filters, state.loading, state.repoId, state.loadedCount, state.repository]);

    useEffect(() => {
        if (!state.loadingMore || !state.activeGraphRequestId) { return; }
        sendMessage(messageForLoadMore(
            state.repoId,
            state.filters,
            { offset: state.loadedCount, limit: PAGE_LIMIT },
            state.repository,
            state.activeGraphRequestId,
        ));
    }, [sendMessage, state.activeGraphRequestId, state.filters, state.loadedCount, state.loadingMore, state.repoId, state.repository]);

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
            const worktree = state.worktrees.find((candidate) => candidate.path === state.commitDetails?.path)?.locator;
            sendMessage(messageForOpenWorktreeDiff(
                state.commitDetails.path,
                file.filePath,
                file.status,
                file.origPath,
                file.isSubmodule,
                state.repository,
                worktree,
            ));
            return;
        }
        if (!state.selectedHash) { return; }
        sendMessage(messageForOpenDiff(
            file.filePath,
            state.selectedHash,
            file.status,
            file.origPath,
            file.parentHash,
            file.isSubmodule,
            state.repository,
        ));
    }, [sendMessage, state.commitDetails, state.repository, state.selectedHash, state.worktrees]);

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
        sendMessage(messageForGraphContextTarget(contextTargetForRepository(target, state.repository)));
    }, [sendMessage, state.repository]);

    const handleSelectSubmodule = useCallback((submodule: GraphSubmoduleInfo) => {
        dispatch({
            type: 'selectSubmodule',
            submodulePath: submodule.path,
            submoduleLabel: submodule.name,
            ...(submodule.repository ? { repository: submodule.repository } : {}),
        });
    }, []);

    const handleMoveGraphFocus = useCallback((currentHash: string, direction: 'previous' | 'next', mode?: 'replace' | 'toggle' | 'range') => {
        const hashes = state.rows.map((row) => row.commit.hash);
        const currentIndex = hashes.indexOf(currentHash);
        const nextHash = direction === 'next' ? hashes[currentIndex + 1] : hashes[currentIndex - 1];
        if (!nextHash) { return; }
        document.querySelector<HTMLElement>(`[data-graph-commit-hash="${nextHash}"]`)?.focus();
        if (mode) { handleSelectCommit(nextHash, mode); }
    }, [handleSelectCommit, state.rows]);


    return (
        <RepositoryNavigator
            repositories={state.repositorySummaries}
            activeContextId={state.activeRepositoryContextId}
            listContextId={state.repositoryListContextId}
            title="Repositories"
            onNavigate={(contextId) => {
                dispatch({ type: 'selectRepositoryContext', contextId });
                sendMessage({ type: 'repo/selectRepository', contextId });
            }}
            onShowRepositoryList={(contextId) => {
                dispatch({ type: 'showRepositoryList', contextId });
                sendMessage({ type: 'repo/showRepositoryList', ...(contextId ? { contextId } : {}) });
            }}
            onOpenInNewWindow={(contextId) => sendMessage({ type: 'repo/openRepositoryInNewWindow', contextId })}
        >

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
                            selectedRepository={state.selectedRepository}
                            currentBranch={state.currentBranch}
                            hasRemotes={state.hasRemotes}
                            selectedBranchFilter={state.selectedBranchFilter}
                            selectedWorktreePath={state.selectedWorktreePath}
                            operationStatus={state.operationStatus}
                            onSelectBranch={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                            onSelectMainRepository={() => dispatch({ type: 'selectMainRepository' })}
                            onSelectSubmodule={handleSelectSubmodule}
                            onBranchCommand={(command, branch, isRemote) => sendMessage(messageForBranchCommand(command, branch, isRemote, state.repository))}
                            onFetch={() => sendMessage(messageForGraphRepositoryCommand('fetch', state.repository))}
                            onSelectWorktree={handleSelectWorktree}
                            onOpenWorktree={(path) => sendMessage(messageForWorktreeCommand('openInNewWindow', path, state.repository, state.worktrees.find((worktree) => worktree.path === path)?.locator))}
                            onAddWorktree={() => sendMessage(messageForWorktreeCommand('add', undefined, state.repository))}
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
                            onShowOutput={() => sendMessage({ type: 'graph/showOutput' })}
                            onDismiss={() => {
                                if (state.operationStatus) {
                                    dispatch({ type: 'clearOperationStatus', operationId: state.operationStatus.operationId });
                                }
                            }}
                        />

                        <ErrorNotice
                            error={state.error}
                            primaryAction={{ label: 'Retry', onClick: () => dispatch({ type: 'refreshRequested' }) }}
                            secondaryAction={state.error?.details ? { label: 'Show Output', onClick: () => sendMessage({ type: 'graph/showOutput' }) } : undefined}
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
                                onBranchDoubleClick={(branch, isRemote) => sendMessage(messageForBranchCheckout(branch, isRemote, state.repository))}
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
        </RepositoryNavigator>

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

function contextTargetForRepository(target: GraphContextTarget, repository: RepositoryLocator | undefined): GraphContextTarget {
    return repository ? { ...target, repository } : target;
}
