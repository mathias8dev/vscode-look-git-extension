import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BranchInfo } from '../../../protocol/graph/types';
import type { CommitCommand } from '../../../protocol/graph/messages';
import type { GraphRow } from './layout/assignGraphLanes';
import { GraphCommitRow, type CommitSelectMode } from './GraphRow';
import { GraphWIPRow } from './GraphWIPRow';
import { ROW_HEIGHT } from './GraphLaneCell';
import { CommitContextMenu, type CommitContextMenuState } from './CommitContextMenu';
import { getVisibleGraphRowRange } from './graphVirtualization';
import type { DisplayRow } from './graphState';

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
    readonly onCommitCommand: (command: CommitCommand, hash: string, hashes: readonly string[]) => void;
    readonly onLoadMore: () => void;
    readonly onPostMessage: (msg: unknown) => void;
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
    onCommitCommand,
    onLoadMore,
    onPostMessage,
}: GraphTableProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<CommitContextMenuState | undefined>(undefined);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(400);
    const totalHeight = displayRows.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);

    const measureViewport = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) { return; }
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
        measureViewport();
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measureViewport);
        };
    }, [measureViewport]);

    const handleScroll = useCallback(() => {
        if (wrapperRef.current) {
            setScrollTop(wrapperRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        if (!hasMore || loadingMore) { return; }
        const nearBottom = scrollTop + viewportHeight >= totalHeight - ROW_HEIGHT * 5;
        if (nearBottom) { onLoadMore(); }
    }, [scrollTop, viewportHeight, totalHeight, hasMore, loadingMore, onLoadMore]);

    const { firstVisible, lastVisible } = getVisibleGraphRowRange(displayRows.length, scrollTop, viewportHeight);

    const visibleDisplayRows = displayRows.slice(firstVisible, lastVisible + 1);
    const selectedHashSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);
    const selectedRows = rows.filter((row) => selectedHashSet.has(row.commit.hash));

    const handleOpenContextMenu = useCallback((hash: string, x: number, y: number) => {
        const hashes = selectedHashSet.has(hash) ? selectedHashes : [hash];
        if (!selectedHashSet.has(hash)) { onSelectCommit(hash, 'replace'); }
        setContextMenu({
            hash,
            hashes,
            x,
            y,
            canGoToChild: childHash(rows, hash) !== undefined,
            canGoToParent: parentHash(rows, hash) !== undefined,
            canUndoCommit: rows[0]?.commit.hash === hash,
        });
    }, [onSelectCommit, rows, selectedHashSet, selectedHashes]);

    const goToHash = useCallback((hash: string | undefined) => {
        if (hash) { onSelectCommit(hash, 'replace'); }
    }, [onSelectCommit]);

    return (
        <div className="graph-table-wrapper">
            <header
                className="graph-table-header"
            >
                <div className="graph-header-message">Message</div>
                <div className="graph-header-author">Author</div>
                <div className="graph-header-date">Date</div>
            </header>
            <div
                ref={wrapperRef}
                className="graph-scroll-area"
                onScroll={handleScroll}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {visibleDisplayRows.map((displayRow, i) => {
                        const top = (firstVisible + i) * ROW_HEIGHT;
                        const rowStyle = { position: 'absolute' as const, top, left: 0, right: 0 };
                        if (displayRow.kind === 'wip') {
                            return (
                                <GraphWIPRow
                                    key={`wip:${displayRow.wip.path}`}
                                    wip={displayRow.wip}
                                    laneData={displayRow.laneData}
                                    style={rowStyle}
                                    selected={displayRow.wip.path === selectedWorktreePath}
                                    onSelect={onSelectWorktree}
                                />
                            );
                        }
                        const { row } = displayRow;
                        return (
                            <GraphCommitRow
                                key={row.commit.hash}
                                row={row}
                                branches={branches}
                                selected={selectedHashSet.has(row.commit.hash)}
                                style={rowStyle}
                                onSelect={onSelectCommit}
                                onOpenContextMenu={(commit, x, y) => handleOpenContextMenu(commit.hash, x, y)}
                                onPostMessage={onPostMessage}
                            />
                        );
                    })}
                    {hasMore && (
                        <button
                            type="button"
                            className="graph-load-more"
                            style={{
                                position: 'absolute',
                                top: displayRows.length * ROW_HEIGHT,
                                left: 0,
                                right: 0,
                            }}
                            disabled={loadingMore}
                            onClick={onLoadMore}
                        >
                            {loadingMore ? 'Loading commits...' : 'Load more commits'}
                        </button>
                    )}
                </div>
            </div>
            {contextMenu ? (
                <CommitContextMenu
                    state={contextMenu}
                    onClose={() => setContextMenu(undefined)}
                    onCommand={(command, hash, hashes) => onCommitCommand(command, hash, hashes)}
                    onGoToChild={(hash) => goToHash(childHash(selectedRows.length > 0 ? selectedRows : rows, hash) ?? childHash(rows, hash))}
                    onGoToParent={(hash) => goToHash(parentHash(rows, hash))}
                />
            ) : null}
        </div>
    );
}

function parentHash(rows: readonly GraphRow[], hash: string): string | undefined {
    return rows.find((row) => row.commit.hash === hash)?.commit.parentHashes[0];
}

function childHash(rows: readonly GraphRow[], hash: string): string | undefined {
    return rows.find((row) => row.commit.parentHashes.includes(hash))?.commit.hash;
}
