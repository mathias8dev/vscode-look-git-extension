import type { CSSProperties } from 'react';

export type GraphColumnId = 'message' | 'author' | 'date';

export interface GraphColumnSize {
    readonly defaultSize: number;
    readonly minSize: number;
    readonly maxSize: number;
    readonly storageKey: string;
    readonly label: string;
}

export type GraphColumnWidths = Readonly<Record<GraphColumnId, number>>;

export type GraphTableColumnStyle = CSSProperties & {
    readonly '--graph-message-column-width': string;
    readonly '--graph-author-column-width': string;
    readonly '--graph-date-column-width': string;
    readonly '--graph-table-min-width': string;
};

export const GRAPH_COLUMNS: Readonly<Record<GraphColumnId, GraphColumnSize>> = {
    message: {
        defaultSize: 520,
        minSize: 220,
        maxSize: 1200,
        storageKey: 'lookGit.graph.messageColumnWidth',
        label: 'message',
    },
    author: {
        defaultSize: 120,
        minSize: 80,
        maxSize: 360,
        storageKey: 'lookGit.graph.authorColumnWidth',
        label: 'author',
    },
    date: {
        defaultSize: 160,
        minSize: 120,
        maxSize: 260,
        storageKey: 'lookGit.graph.dateColumnWidth',
        label: 'date',
    },
};

export function readSavedGraphColumnWidths(): GraphColumnWidths {
    return {
        message: readSavedGraphColumnWidth('message'),
        author: readSavedGraphColumnWidth('author'),
        date: readSavedGraphColumnWidth('date'),
    };
}

export function graphTableColumnStyle(widths: GraphColumnWidths): GraphTableColumnStyle {
    return {
        '--graph-message-column-width': `${widths.message}px`,
        '--graph-author-column-width': `${widths.author}px`,
        '--graph-date-column-width': `${widths.date}px`,
        '--graph-table-min-width': `${widths.message + widths.author + widths.date}px`,
    };
}

function readSavedGraphColumnWidth(column: GraphColumnId): number {
    const config = GRAPH_COLUMNS[column];
    try {
        const raw = localStorage.getItem(config.storageKey);
        const value = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(value) && value >= config.minSize && value <= config.maxSize ? value : config.defaultSize;
    } catch {
        return config.defaultSize;
    }
}
