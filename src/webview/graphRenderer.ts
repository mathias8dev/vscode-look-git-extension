import type { GraphRow, LineDef } from '../graphView/graphLaneAssigner';

const ROW_HEIGHT = 24;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_PADDING = 8;

export interface RenderedRef {
    name: string;
    type: 'head' | 'branch-local' | 'branch-remote' | 'tag';
}

export function parseRefs(refs: string[], tagNames: Set<string>): RenderedRef[] {
    const result: RenderedRef[] = [];
    for (const ref of refs) {
        if (ref === 'HEAD') {
            continue; // shown via HEAD -> branch
        }
        if (ref.startsWith('HEAD -> ')) {
            result.push({ name: ref.replace('HEAD -> ', ''), type: 'head' });
        } else if (ref.startsWith('tag: ')) {
            result.push({ name: ref.replace('tag: ', ''), type: 'tag' });
        } else if (tagNames.has(ref)) {
            result.push({ name: ref, type: 'tag' });
        } else if (ref.includes('/')) {
            result.push({ name: ref, type: 'branch-remote' });
        } else {
            result.push({ name: ref, type: 'branch-local' });
        }
    }
    return result;
}

export function renderGraphSvg(
    row: GraphRow,
    maxLane: number,
): string {
    const width = (maxLane + 2) * LANE_WIDTH + GRAPH_PADDING * 2;
    const height = ROW_HEIGHT;
    const cy = height / 2;

    const parts: string[] = [];
    parts.push(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`);

    // Draw lines
    for (const line of row.laneData.lines) {
        parts.push(renderLine(line, cy, height));
    }

    // Draw commit dot
    const cx = GRAPH_PADDING + row.laneData.lane * LANE_WIDTH + LANE_WIDTH / 2;
    parts.push(
        `<circle class="commit-dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" ` +
        `fill="${row.laneData.color}" stroke="var(--vscode-editor-background)" />`
    );

    parts.push('</svg>');
    return parts.join('');
}

function renderLine(line: LineDef, cy: number, height: number): string {
    const x1 = GRAPH_PADDING + line.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
    const x2 = GRAPH_PADDING + line.toLane * LANE_WIDTH + LANE_WIDTH / 2;

    if (line.type === 'straight') {
        return `<line x1="${x1}" y1="0" x2="${x2}" y2="${height}" stroke="${line.color}" stroke-width="2" />`;
    }

    // Curved lines for merges and forks
    const midY = cy;
    if (line.type === 'merge-left' || line.type === 'merge-right') {
        // From this commit's lane, curve down to the parent's lane
        return `<path d="M ${x1} ${midY} C ${x1} ${height}, ${x2} ${midY}, ${x2} ${height}" ` +
               `stroke="${line.color}" stroke-width="2" fill="none" />`;
    }

    if (line.type === 'fork-left' || line.type === 'fork-right') {
        // From this commit's lane, curve down to the new lane
        return `<path d="M ${x1} ${midY} C ${x1} ${height}, ${x2} ${midY}, ${x2} ${height}" ` +
               `stroke="${line.color}" stroke-width="2" fill="none" />`;
    }

    return '';
}

export function formatRelativeDate(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 30) {
        return date.toLocaleDateString();
    }
    if (diffDay > 0) {
        return `${diffDay}d ago`;
    }
    if (diffHour > 0) {
        return `${diffHour}h ago`;
    }
    if (diffMin > 0) {
        return `${diffMin}m ago`;
    }
    return 'just now';
}

export function renderRefBadges(refs: RenderedRef[]): string {
    return refs.map((r) =>
        `<span class="ref-badge ${r.type}">${escapeHtml(r.name)}</span>`
    ).join('');
}

export function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
