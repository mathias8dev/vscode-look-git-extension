import { describe, expect, it } from 'vitest';
import { renderGraphSvg } from '../src/webview/graphRenderer';
import type { GraphRow } from '../src/graphView/graphLaneAssigner';

function row(type: GraphRow['laneData']['lines'][number]['type'] = 'straight'): GraphRow {
    return {
        commit: {
            hash: 'abc123456789',
            shortHash: 'abc1234',
            message: 'commit',
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: ['parent'],
            refs: [],
        },
        laneData: {
            lane: 0,
            color: '#f97583',
            lines: [{
                fromLane: 0,
                toLane: type === 'straight' ? 0 : 1,
                color: '#f97583',
                type,
            }],
        },
    };
}

describe('graphRenderer', () => {
    it('renders graph lines with dedicated classes and a commit halo', () => {
        const svg = renderGraphSvg(row(), 1);

        expect(svg).toContain('class="commit-graph-svg"');
        expect(svg).toContain('class="graph-line"');
        expect(svg).toContain('class="commit-dot-halo"');
        expect(svg).toContain('class="commit-dot"');
        expect(svg).toContain('aria-hidden="true"');
    });

    it('renders curved branch lines with rounded graph-line styling hooks', () => {
        const svg = renderGraphSvg(row('fork-right'), 1);

        expect(svg).toContain('<path class="graph-line"');
        expect(svg).toContain('C ');
    });
});
