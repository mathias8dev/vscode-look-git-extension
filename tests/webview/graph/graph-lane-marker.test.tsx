// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphLaneCell } from '@webview/features/graph/graph-lane-cell';
import type { LaneData } from '@webview/features/graph/layout/graph-lane-model';

const laneData: LaneData = {
    lane: 1,
    color: '#79b8ff',
    isPrimary: false,
    lines: [
        {
            fromLane: 1, toLane: 1, color: '#79b8ff', type: 'straight',
            role: 'pass-through', startY: 'top', endY: 'center', targetHash: 'head',
        },
        {
            fromLane: 0, toLane: 0, color: '#f97583', type: 'straight',
            role: 'pass-through', startY: 'top', endY: 'bottom', targetHash: 'parallel',
        },
        {
            fromLane: 1, toLane: 2, color: '#79b8ff', type: 'fork-right',
            role: 'first-parent', startY: 'center', endY: 'bottom', targetHash: 'parent',
        },
    ],
};

describe('Graph lane markers', () => {
    it('gives WIP and merge markers the same outer diameter while keeping WIP rings hollow', () => {
        const { container } = render(<>
            <GraphLaneCell laneData={laneData} wip />
            <GraphLaneCell laneData={laneData} merge />
        </>);
        const [wip, merge] = container.querySelectorAll('svg');
        const wipRings = wip?.querySelectorAll('svg > circle');
        const mergeRings = merge?.querySelectorAll('svg > circle');

        expect(wipRings).toHaveLength(2);
        expect(mergeRings).toHaveLength(2);
        expect(wipRings?.[0]).toHaveAttribute('r', '5.5');
        expect(wipRings?.[0]).toHaveAttribute('stroke-width', '2');
        expect(wipRings?.[0]).toHaveAttribute('stroke-dasharray', '3 2');
        expect(wipRings?.[1]).toHaveAttribute('r', '2.5');
        expect(wipRings?.[1]).toHaveAttribute('fill', 'none');
        expect(wipRings?.[1]).toHaveAttribute('stroke', laneData.color);
        expect(mergeRings?.[0]).toHaveAttribute('r', '5.5');
        expect(mergeRings?.[0]).toHaveAttribute('stroke-width', '2');
        expect(mergeRings?.[0]).not.toHaveAttribute('stroke-dasharray');
        expect(mergeRings?.[1]).toHaveAttribute('fill', laneData.color);
    });

    it.each([
        { marker: 'WIP', wip: true, merge: false, rowHeight: 28 },
        { marker: 'WIP', wip: true, merge: false, rowHeight: 35 },
        { marker: 'WIP', wip: true, merge: false, rowHeight: 48 },
        { marker: 'merge', wip: false, merge: true, rowHeight: 28 },
        { marker: 'merge', wip: false, merge: true, rowHeight: 35 },
        { marker: 'merge', wip: false, merge: true, rowHeight: 48 },
    ])('masks the full $marker marker and its stroke at row height $rowHeight', ({ wip, merge, rowHeight }) => {
        const { container } = render(<GraphLaneCell laneData={laneData} wip={wip} merge={merge} rowHeight={rowHeight} />);
        const mask = container.querySelector('mask');
        const lines = container.querySelector('svg > g');
        const cutout = mask?.querySelector('path');

        expect(mask).toHaveAttribute('maskUnits', 'userSpaceOnUse');
        expect(mask).toHaveStyle({ maskType: 'alpha' });
        expect(mask).toHaveAttribute('x', '-2');
        expect(mask).toHaveAttribute('y', '-2');
        expect(mask).toHaveAttribute('width', '52');
        expect(mask).toHaveAttribute('height', String(rowHeight + 4));
        expect(cutout).toHaveAttribute('fill-rule', 'evenodd');
        expect(cutout?.getAttribute('d')).toContain(`M 17.5 ${rowHeight / 2} a 6.5 6.5 0 1 0 13 0`);
        expect(lines).toHaveAttribute('mask', `url(#${mask?.id})`);
        expect(lines?.querySelectorAll('line')).toHaveLength(2);
        expect(lines?.querySelectorAll('path')).toHaveLength(1);
        expect(lines?.querySelectorAll('line')[1]).toHaveAttribute('y1', '0');
        expect(lines?.querySelectorAll('line')[1]).toHaveAttribute('y2', String(rowHeight));
        for (const ring of container.querySelectorAll('svg > circle')) {
            expect(ring).not.toHaveAttribute('mask');
            expect(ring).toHaveAttribute('cy', String(rowHeight / 2));
        }
    });

    it('keeps masks unique per graph row and stable across redraws', () => {
        const { container, rerender } = render(<>
            <GraphLaneCell laneData={laneData} wip />
            <GraphLaneCell laneData={laneData} merge />
        </>);
        const ids = [...container.querySelectorAll('mask')].map((mask) => mask.id);

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        rerender(<>
            <GraphLaneCell laneData={{ ...laneData, color: '#f97583' }} wip />
            <GraphLaneCell laneData={{ ...laneData, color: '#f97583' }} merge />
        </>);
        expect([...container.querySelectorAll('mask')].map((mask) => mask.id)).toEqual(ids);
        expect([...container.querySelectorAll('svg > g')].map((lines) => lines.getAttribute('mask')))
            .toEqual(ids.map((id) => `url(#${id})`));
    });

    it('keeps ordinary commit markers unchanged', () => {
        const { container } = render(<GraphLaneCell laneData={laneData} />);

        expect(container.querySelector('mask')).toBeNull();
        expect(container.querySelectorAll('circle')).toHaveLength(1);
        expect(container.querySelector('circle')).toHaveAttribute('r', '4');
        expect(container.querySelector('circle')).toHaveAttribute('fill', laneData.color);
    });
});
