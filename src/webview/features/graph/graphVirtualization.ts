import { ROW_HEIGHT } from '@webview/features/graph/graphRowSizing';

const OVERSCAN = 8;

export function getVisibleGraphRowRange(rowCount: number, scrollTop: number, viewportHeight: number, rowHeight = ROW_HEIGHT): { readonly firstVisible: number; readonly lastVisible: number } {
    if (rowCount === 0) { return { firstVisible: 0, lastVisible: -1 }; }
    const measuredRowHeight = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : ROW_HEIGHT;
    return {
        firstVisible: Math.max(0, Math.floor(scrollTop / measuredRowHeight) - OVERSCAN),
        lastVisible: Math.min(
            rowCount - 1,
            Math.ceil((scrollTop + viewportHeight) / measuredRowHeight) + OVERSCAN,
        ),
    };
}
