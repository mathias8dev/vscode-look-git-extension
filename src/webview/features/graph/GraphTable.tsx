import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BranchInfo } from '../../../protocol/graph/types';
import type { GraphRow } from './layout/assignGraphLanes';
import { GraphCommitRow } from './GraphRow';
import { ROW_HEIGHT, LANE_WIDTH } from './GraphLaneCell';

const OVERSCAN = 8;

interface GraphTableProps {
    readonly rows: readonly GraphRow[];
    readonly branches: readonly BranchInfo[];
    readonly maxLane: number;
    readonly selectedHash: string | undefined;
    readonly hasMore: boolean;
    readonly loadingMore: boolean;
    readonly onSelectCommit: (hash: string) => void;
    readonly onLoadMore: () => void;
    readonly onPostMessage: (msg: unknown) => void;
}

export function GraphTable({
    rows,
    branches,
    maxLane,
    selectedHash,
    hasMore,
    loadingMore,
    onSelectCommit,
    onLoadMore,
    onPostMessage,
}: GraphTableProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(400);
    const colWidth = (maxLane + 1) * LANE_WIDTH + 4;
    const totalHeight = rows.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);
    const graphColumnStyle: CSSProperties & { readonly '--graph-col-width': string } = {
        '--graph-col-width': `${colWidth}px`,
    };

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) { return; }
        const observer = new ResizeObserver(() => {
            setViewportHeight(el.clientHeight);
        });
        observer.observe(el);
        setViewportHeight(el.clientHeight);
        return () => observer.disconnect();
    }, []);

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

    const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const lastVisible = Math.min(
        rows.length - 1,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
    );

    const visibleRows = rows.slice(firstVisible, lastVisible + 1);

    return (
        <div className="graph-table-wrapper">
            <header
                className="graph-table-header"
                style={graphColumnStyle}
            >
                <div className="graph-header-lane" />
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
                    {visibleRows.map((row, i) => (
                        <GraphCommitRow
                            key={row.commit.hash}
                            row={row}
                            branches={branches}
                            maxLane={maxLane}
                            selected={row.commit.hash === selectedHash}
                            style={{
                                position: 'absolute',
                                top: (firstVisible + i) * ROW_HEIGHT,
                                left: 0,
                                right: 0,
                            }}
                            onSelect={onSelectCommit}
                            onPostMessage={onPostMessage}
                        />
                    ))}
                    {hasMore && (
                        <button
                            type="button"
                            className="graph-load-more"
                            style={{
                                position: 'absolute',
                                top: rows.length * ROW_HEIGHT,
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
        </div>
    );
}
