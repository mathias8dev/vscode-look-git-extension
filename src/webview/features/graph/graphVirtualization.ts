import { ROW_HEIGHT } from './GraphLaneCell';

const OVERSCAN = 8;

export function getVisibleGraphRowRange(rowCount: number, scrollTop: number, viewportHeight: number): { readonly firstVisible: number; readonly lastVisible: number } {
    if (rowCount === 0) { return { firstVisible: 0, lastVisible: -1 }; }
    return {
        firstVisible: Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN),
        lastVisible: Math.min(
            rowCount - 1,
            Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
        ),
    };
}
