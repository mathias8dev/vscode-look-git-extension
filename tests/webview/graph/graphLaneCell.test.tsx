import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GraphLaneCell } from '../../../src/webview/features/graph/GraphLaneCell';
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

        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} maxLane={0} />);

        expect(markup).toContain('y1="12"');
        expect(markup).toContain('y2="24"');
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

        const markup = renderToStaticMarkup(<GraphLaneCell laneData={laneData} maxLane={1} />);

        expect(markup).toContain('M 8 12');
        expect(markup).toContain('24 24');
    });
});
