import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BranchInfo, GraphContextTarget } from '@protocol/graph/types';
import type { GraphRow } from '@webview/features/graph/layout/graph-lane-model';
import { GraphColumnHeader } from '@webview/features/graph/graph-column-header';
import { GraphCommitRow, type CommitSelectMode } from '@webview/features/graph/graph-row';
import { GraphWIPRow } from '@webview/features/graph/graph-wip-row';
import { ROW_HEIGHT, rowHeightForFontSize } from '@webview/features/graph/graph-row-sizing';
import { getVisibleGraphRowRange } from '@webview/features/graph/graph-virtualization';
import type { DisplayRow } from '@webview/features/graph/graph-state';
import {
    graphTableColumnStyle,
    readSavedGraphColumnWidths,
    type GraphColumnId,
} from '@webview/features/graph/graph-table-columns';

interface GraphTableProps {
    readonly rows: readonly GraphRow[];
    readonly displayRows: readonly DisplayRow[];
    readonly branches: readonly BranchInfo[];
    readonly selectedHashes: readonly string[];
    readonly selectedWorktreePath: string | undefined;
    readonly hasMore: boolean;
    readonly loadingMore: boolean;
    readonly onSelectCommit: (hash: string, mode: CommitSelectMode) => void;
    readonly onSelectWorktree: (path: string) => void;
    readonly onContextTarget: (target: GraphContextTarget) => void;
    readonly onLoadMore: () => void;
    readonly onBranchDoubleClick: (branch: string, isRemote: boolean) => void;
    readonly onMoveFocus: (currentHash: string, direction: 'previous' | 'next', mode?: CommitSelectMode) => void;
}

export function GraphTable({
    rows,
    displayRows,
    branches,
    selectedHashes,
    selectedWorktreePath,
    hasMore,
    loadingMore,
    onSelectCommit,
    onSelectWorktree,
    onContextTarget,
    onLoadMore,
    onBranchDoubleClick,
    onMoveFocus,
}: GraphTableProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(400);
    const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
    const [columnWidths, setColumnWidths] = useState(readSavedGraphColumnWidths);
    const totalHeight = displayRows.length * rowHeight + (hasMore ? rowHeight : 0);
    const tableStyle = graphTableColumnStyle(columnWidths);

    const measureViewport = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) { return; }
        setRowHeight(measuredGraphRowHeight(el));
        setViewportHeight(el.clientHeight);
        setScrollTop(el.scrollTop);
    }, []);

    useLayoutEffect(() => {
        measureViewport();
    });

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) { return; }
        const observer = new ResizeObserver(() => {
            measureViewport();
        });
        observer.observe(el);
        window.addEventListener('resize', measureViewport);
        window.addEventListener('lookGitFontSizeChanged', measureViewport);
        measureViewport();
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measureViewport);
            window.removeEventListener('lookGitFontSizeChanged', measureViewport);
        };
    }, [measureViewport]);

    const handleScroll = useCallback(() => {
        if (wrapperRef.current) {
            setScrollTop(wrapperRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        if (!hasMore || loadingMore) { return; }
        const nearBottom = scrollTop + viewportHeight >= totalHeight - rowHeight * 5;
        if (nearBottom) { onLoadMore(); }
    }, [scrollTop, viewportHeight, totalHeight, hasMore, loadingMore, onLoadMore, rowHeight]);

    const { firstVisible, lastVisible } = getVisibleGraphRowRange(displayRows.length, scrollTop, viewportHeight, rowHeight);

    const visibleDisplayRows = displayRows.slice(firstVisible, lastVisible + 1);
    const selectedHashSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);
    const commitByHash = useMemo(() => new Map(rows.map((row) => [row.commit.hash, row.commit])), [rows]);
    const handleColumnSizeChange = useCallback((column: GraphColumnId, width: number) => {
        setColumnWidths((current) => current[column] === width ? current : { ...current, [column]: width });
    }, []);

    const handleOpenContextMenu = useCallback((hash: string) => {
        const hashes = selectedHashSet.has(hash) ? selectedHashes : [hash];
        const canCherryPick = hashes.every((selectedHash) => commitByHash.get(selectedHash)?.canCherryPick ?? true);
        if (!selectedHashSet.has(hash)) { onSelectCommit(hash, 'replace'); }
        onContextTarget({
            kind: 'commit',
            hash,
            hashes,
            childHash: childHash(rows, hash),
            parentHash: parentHash(rows, hash),
            canUndoCommit: rows[0]?.commit.hash === hash,
            canCherryPick,
            canSquash: hashes.length > 1,
        });
    }, [commitByHash, onContextTarget, onSelectCommit, rows, selectedHashSet, selectedHashes]);

    return (
        <div className="graph-table-wrapper" style={tableStyle}>
            <div className="graph-table-horizontal">
                <header
                    className="graph-table-header"
                >
                    <GraphColumnHeader
                        className="graph-header-message"
                        column="message"
                        onSizeChange={handleColumnSizeChange}
                    >
                        Message
                    </GraphColumnHeader>
                    <GraphColumnHeader
                        className="graph-header-author"
                        column="author"
                        onSizeChange={handleColumnSizeChange}
                    >
                        Author
                    </GraphColumnHeader>
                    <GraphColumnHeader
                        className="graph-header-date"
                        column="date"
                        onSizeChange={handleColumnSizeChange}
                    >
                        Date
                    </GraphColumnHeader>
                </header>
                <div
                    ref={wrapperRef}
                    className="graph-scroll-area"
                    onScroll={handleScroll}
                >
                    <div style={{ height: totalHeight, position: 'relative' }}>
                        {visibleDisplayRows.map((displayRow, i) => {
                            const top = (firstVisible + i) * rowHeight;
                            const rowStyle = { position: 'absolute' as const, top, left: 0, right: 0, height: rowHeight };
                            if (displayRow.kind === 'wip') {
                                return (
                                    <GraphWIPRow
                                        key={`wip:${displayRow.wip.path}`}
                                        wip={displayRow.wip}
                                        laneData={displayRow.laneData}
                                        style={rowStyle}
                                        rowHeight={rowHeight}
                                        selected={displayRow.wip.path === selectedWorktreePath}
                                        onSelect={onSelectWorktree}
                                    />
                                );
                            }
                            const { row } = displayRow;
                            const rowSelected = selectedHashSet.has(row.commit.hash);
                            const selectedCanCherryPick = selectedHashes.every((hash) => commitByHash.get(hash)?.canCherryPick ?? true);
                            return (
                                <GraphCommitRow
                                    key={row.commit.hash}
                                    row={row}
                                    branches={branches}
                                    selected={rowSelected}
                                    childHash={childHash(rows, row.commit.hash)}
                                    parentHash={parentHash(rows, row.commit.hash)}
                                    canUndoCommit={rows[0]?.commit.hash === row.commit.hash}
                                    canCherryPick={rowSelected ? selectedCanCherryPick : row.commit.canCherryPick ?? true}
                                    hasMultipleSelectedCommits={rowSelected && selectedHashes.length > 1}
                                    style={rowStyle}
                                    rowHeight={rowHeight}
                                    onSelect={onSelectCommit}
                                    onOpenContextMenu={(commit) => handleOpenContextMenu(commit.hash)}
                                    onBranchDoubleClick={onBranchDoubleClick}
                                    onMoveFocus={onMoveFocus}
                                />
                            );
                        })}
                        {hasMore && (
                            <button
                                type="button"
                                className="graph-load-more"
                                style={{
                                    position: 'absolute',
                                    top: displayRows.length * rowHeight,
                                    left: 0,
                                    right: 0,
                                    height: rowHeight,
                                }}
                                disabled={loadingMore}
                                onClick={onLoadMore}
                            >
                                {loadingMore ? 'Loading commits...' : 'Load more commits'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function measuredGraphRowHeight(element: HTMLElement): number {
    const fontSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
    return rowHeightForFontSize(fontSize);
}

function parentHash(rows: readonly GraphRow[], hash: string): string | undefined {
    return rows.find((row) => row.commit.hash === hash)?.commit.parentHashes[0];
}

function childHash(rows: readonly GraphRow[], hash: string): string | undefined {
    return rows.find((row) => row.commit.parentHashes.includes(hash))?.commit.hash;
}
