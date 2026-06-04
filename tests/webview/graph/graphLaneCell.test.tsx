import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GraphLaneCell } from '../../../src/webview/features/graph/GraphLaneCell';
import { rowHeightForFontSize } from '../../../src/webview/features/graph/graphRowSizing';
import type { LaneData } from '../../../src/webview/features/graph/layout/assignGraphLanes';

describe('GraphLaneCell', () => {
    it('renders straight lines with their requested vertical endpoints', () => {
        const laneData: LaneData = {
            lane: 0,
            color: '#fff',
            isPrimary: false,
            lines: [{
                fromLane: 0,
                toLane: 0,
                color: '#fff',
                type: 'straight',
                role: 'first-parent',
                startY: 'center',
                endY: 'bottom',
            }],
        };

        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} />);

        expect(markup).toContain('width="16"');
        expect(markup).toContain('y1="14"');
        expect(markup).toContain('y2="28"');
    });

    it('renders curved parent edges to the next row boundary', () => {
        const laneData: LaneData = {
            lane: 0,
            color: '#fff',
            isPrimary: false,
            lines: [{
                fromLane: 0,
                toLane: 1,
                color: '#fff',
                type: 'fork-right',
                role: 'merge-parent',
                startY: 'center',
                endY: 'bottom',
            }],
        };

        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} />);

        expect(markup).toContain('width="32"');
        expect(markup).toContain('M 8 14');
        expect(markup).toContain('24 28');
    });

    it('scales vertical geometry with the measured graph row height', () => {
        const laneData: LaneData = {
            lane: 0,
            color: '#fff',
            isPrimary: false,
            lines: [{
                fromLane: 0,
                toLane: 0,
                color: '#fff',
                type: 'straight',
                role: 'first-parent',
                startY: 'center',
                endY: 'bottom',
            }],
        };

        const rowHeight = rowHeightForFontSize(20);
        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} rowHeight={rowHeight} />);

        expect(rowHeight).toBe(35);
        expect(markup).toContain('height="35"');
        expect(markup).toContain('y1="17.5"');
        expect(markup).toContain('y2="35"');
    });

    it('renders merge commits with a double circle marker', () => {
        const laneData: LaneData = {
            lane: 0,
            color: '#fff',
            isPrimary: false,
            lines: [],
        };

        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} merge />);

        expect(markup).toContain('r="5.5"');
        expect(markup).toContain('stroke="#fff"');
        expect(markup).toContain('r="2.5"');
        expect(markup).toContain('fill="#fff"');
    });
});
