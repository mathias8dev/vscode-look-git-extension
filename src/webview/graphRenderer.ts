import type { GraphRow, LineDef } from '../graphView/graphLaneAssigner';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4.5;
const DOT_HALO_RADIUS = 7;
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
    parts.push(`<svg class="commit-graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`);

    // Draw lines
    for (const line of row.laneData.lines) {
        parts.push(renderLine(line, cy, height));
    }

    // Draw commit dot
    const cx = GRAPH_PADDING + row.laneData.lane * LANE_WIDTH + LANE_WIDTH / 2;
    parts.push(
        `<circle class="commit-dot-halo" cx="${cx}" cy="${cy}" r="${DOT_HALO_RADIUS}" fill="${row.laneData.color}" />` +
        `<circle class="commit-dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" ` +
        `fill="${row.laneData.color}" stroke="var(--vscode-editor-background)" stroke-width="2" />`
    );

    parts.push('</svg>');
    return parts.join('');
}

function renderLine(line: LineDef, cy: number, height: number): string {
    const x1 = GRAPH_PADDING + line.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
    const x2 = GRAPH_PADDING + line.toLane * LANE_WIDTH + LANE_WIDTH / 2;

    if (line.type === 'straight') {
        return `<line ${renderLineAttributes(line)} x1="${x1}" y1="-1" x2="${x2}" y2="${height + 1}" stroke="${line.color}" />`;
    }

    // Curved lines for merges and forks
    const midY = cy;
    const bendY = line.role === 'merge-parent' ? cy + height * 0.18 : cy + height * 0.26;
    const elbowY = height + 1;
    if (line.type === 'merge-left' || line.type === 'merge-right') {
        // From this commit's lane, curve down to the parent's lane
        return `<path ${renderLineAttributes(line)} d="M ${x1} ${midY} C ${x1} ${bendY}, ${x2} ${bendY}, ${x2} ${elbowY}" ` +
               `stroke="${line.color}" fill="none" />`;
    }

    if (line.type === 'fork-left' || line.type === 'fork-right') {
        // From this commit's lane, curve down to the new lane
        return `<path ${renderLineAttributes(line)} d="M ${x1} ${midY} C ${x1} ${bendY}, ${x2} ${bendY}, ${x2} ${elbowY}" ` +
               `stroke="${line.color}" fill="none" />`;
    }

    return '';
}

function renderLineAttributes(line: LineDef): string {
    const classes = [
        'graph-line',
        `graph-line-${line.type}`,
        `graph-line-${line.role}`,
    ].join(' ');
    const target = line.targetHash ? ` data-line-target="${escapeHtml(line.targetHash)}"` : '';
    return `class="${classes}"${target}`;
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
    return [...refs].sort(compareRenderedRefs).map((r) =>
        `<span class="ref-badge ${r.type}">${escapeHtml(r.name)}</span>`
    ).join('');
}

function compareRenderedRefs(a: RenderedRef, b: RenderedRef): number {
    const priority = (ref: RenderedRef): number => {
        switch (ref.type) {
            case 'head': return 0;
            case 'branch-local': return 1;
            case 'branch-remote': return 2;
            case 'tag': return 3;
        }
    };
    return priority(a) - priority(b) || a.name.localeCompare(b.name);
}

export function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
