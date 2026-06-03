import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
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
    messageForBranchCommand,
    messageForGraphRepositoryCommand,
    messageForWorktreeCommand,
    messageForWorktreeDetails,
    messageForBranchCheckout,
} from '../features/graph/graphCommands';
import { ErrorNotice } from '../shared/ErrorNotice';
import { vscodeApi } from '../platform/vscodeHost';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '../platform/font-size';

const PAGE_LIMIT = 300;
const ERROR_NOTICE_TIMEOUT_MS = 8000;
const BRANCH_PANEL_MIN = 120;
const BRANCH_PANEL_MAX = 560;
const BRANCH_PANEL_DEFAULT = 260;
const BRANCH_PANEL_KEYBOARD_STEP = 16;
const BRANCH_PANEL_STORAGE_KEY = 'lookGit.branchPanelWidth';

interface BranchPanelResizeDrag {
    readonly pointerId: number;
    readonly startX: number;
    readonly startWidth: number;
    readonly previousCursor: string;
    readonly previousUserSelect: string;
}

function readSavedPanelWidth(): number {
    try {
        const raw = localStorage.getItem(BRANCH_PANEL_STORAGE_KEY);
        const n = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) && n >= BRANCH_PANEL_MIN && n <= BRANCH_PANEL_MAX ? n : BRANCH_PANEL_DEFAULT;
    } catch {
        return BRANCH_PANEL_DEFAULT;
    }
}

function clampBranchPanelWidth(width: number): number {
    return Math.min(BRANCH_PANEL_MAX, Math.max(BRANCH_PANEL_MIN, width));
}

function saveBranchPanelWidth(width: number): void {
    try { localStorage.setItem(BRANCH_PANEL_STORAGE_KEY, String(width)); } catch {}
}

export function GraphApp() {
    const [state, dispatch] = useReducer(reduceGraphState, undefined, createInitialGraphState);
    const [branchPanelWidth, setBranchPanelWidth] = useState(readSavedPanelWidth);
    const resizeDragRef = useRef<BranchPanelResizeDrag | undefined>(undefined);

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

    const finishPanelResize = useCallback((target?: HTMLDivElement, width?: number) => {
        const drag = resizeDragRef.current;
        if (!drag) { return; }
        if (target && typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(drag.pointerId)) {
            target.releasePointerCapture(drag.pointerId);
        }
        document.body.style.cursor = drag.previousCursor;
        document.body.style.userSelect = drag.previousUserSelect;
        resizeDragRef.current = undefined;
        if (width !== undefined) { saveBranchPanelWidth(width); }
    }, []);

    useEffect(() => () => finishPanelResize(), [finishPanelResize]);

    const resizeWidthForClientX = useCallback((clientX: number) => {
        const drag = resizeDragRef.current;
        if (!drag) { return branchPanelWidth; }
        return clampBranchPanelWidth(drag.startWidth + clientX - drag.startX);
    }, [branchPanelWidth]);

    const handlePanelResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        resizeDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: branchPanelWidth,
            previousCursor: document.body.style.cursor,
            previousUserSelect: document.body.style.userSelect,
        };
        if (typeof event.currentTarget.setPointerCapture === 'function') {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [branchPanelWidth]);

    const handlePanelResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = resizeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        setBranchPanelWidth(resizeWidthForClientX(event.clientX));
    }, [resizeWidthForClientX]);

    const handlePanelResizePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = resizeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        const width = resizeWidthForClientX(event.clientX);
        setBranchPanelWidth(width);
        finishPanelResize(event.currentTarget, width);
    }, [finishPanelResize, resizeWidthForClientX]);

    const handlePanelResizePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = resizeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        finishPanelResize(event.currentTarget);
    }, [finishPanelResize]);

    const handlePanelResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        let nextWidth: number | undefined;
        const step = event.shiftKey ? BRANCH_PANEL_KEYBOARD_STEP * 2 : BRANCH_PANEL_KEYBOARD_STEP;
        switch (event.key) {
            case 'ArrowLeft':
                nextWidth = clampBranchPanelWidth(branchPanelWidth - step);
                break;
            case 'ArrowRight':
                nextWidth = clampBranchPanelWidth(branchPanelWidth + step);
                break;
            case 'Home':
                nextWidth = BRANCH_PANEL_MIN;
                break;
            case 'End':
                nextWidth = BRANCH_PANEL_MAX;
                break;
            default:
                return;
        }
        event.preventDefault();
        setBranchPanelWidth(nextWidth);
        saveBranchPanelWidth(nextWidth);
    }, [branchPanelWidth]);

    return (
        <div className="graph-shell">
            <BranchPanel
                style={{ width: branchPanelWidth }}
                branches={state.branches}
                worktrees={state.worktrees}
                currentBranch={state.currentBranch}
                selectedBranchFilter={state.selectedBranchFilter}
                selectedWorktreePath={state.selectedWorktreePath}
                onSelectBranch={(branch) => dispatch({ type: 'setBranchFilter', branch })}
                onBranchCommand={(command, branch, isRemote) => vscodeApi.postMessage(messageForBranchCommand(command, branch, isRemote))}
                onFetch={() => vscodeApi.postMessage(messageForGraphRepositoryCommand('fetch'))}
                onSelectWorktree={handleSelectWorktree}
                onOpenWorktree={(path) => vscodeApi.postMessage(messageForWorktreeCommand('openInNewWindow', path))}
                onAddWorktree={() => vscodeApi.postMessage(messageForWorktreeCommand('add'))}
                onContextTarget={handleContextTarget}
            />
            <div
                className="graph-panel-resize-handle"
                role="separator"
                tabIndex={0}
                aria-label="Resize branches panel"
                aria-orientation="vertical"
                aria-valuemin={BRANCH_PANEL_MIN}
                aria-valuemax={BRANCH_PANEL_MAX}
                aria-valuenow={branchPanelWidth}
                aria-valuetext={`${branchPanelWidth}px`}
                title="Drag or use arrow keys to resize branches panel"
                onPointerDown={handlePanelResizePointerDown}
                onPointerMove={handlePanelResizePointerMove}
                onPointerUp={handlePanelResizePointerEnd}
                onPointerCancel={handlePanelResizePointerCancel}
                onKeyDown={handlePanelResizeKeyDown}
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
                    onBranchDoubleClick={(branch, isRemote) => vscodeApi.postMessage(messageForBranchCheckout(branch, isRemote))}
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
