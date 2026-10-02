import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeWip } from '@protocol/graph/types';
import { GraphWIPRow } from '@webview/features/graph/graph-wip-row';
import { buildDisplayRows } from '@webview/features/graph/graph-state';
import type { LaneData } from '@webview/features/graph/layout/graph-lane-model';

describe('GraphWIPRow', () => {
    it('renders compact ASCII status counters and handles Windows paths', () => {
        const markup = renderToStaticMarkup(
            <GraphWIPRow
                wip={{
                    path: 'C:\\repo\\.worktrees\\feature-draft',
                    head: 'abc123',
                    branch: 'feature/draft',
                    staged: 1,
                    unstaged: 2,
                    untracked: 3,
                    conflicts: 4,
                } satisfies WorktreeWip}
                laneData={laneData(2)}
                style={{}}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(markup).toContain('feature-draft');
        expect(markup).toContain('--graph-row-message-offset:52px');
        expect(markup).toContain('S1');
        expect(markup).toContain('M2');
        expect(markup).toContain('U3');
        expect(markup).toContain('C4');
    });

    it.each([28, 35, 48])('renders incoming and parallel lanes across a WIP row of height %i', (rowHeight) => {
        const wip: WorktreeWip = {
            path: '/repo', head: 'head', branch: 'develop', staged: 0, unstaged: 13, untracked: 15, conflicts: 0,
        };
        const displayRows = buildDisplayRows([{
            commit: {
                hash: 'head', shortHash: 'head', message: 'head', parentHashes: [], refs: [],
                authorName: 'Test User', authorEmail: 'test@example.com', authorDate: '2024-01-01T00:00:00Z',
            },
            laneData: {
                ...laneData(0),
                lines: [
                    {
                        fromLane: 0, toLane: 0, color: '#79b8ff', type: 'straight',
                        role: 'pass-through', startY: 'top', endY: 'center', targetHash: 'head',
                    },
                    {
                        fromLane: 1, toLane: 1, color: '#f97583', type: 'straight',
                        role: 'pass-through', startY: 'top', endY: 'bottom', targetHash: 'parent',
                    },
                ],
            },
        }], [wip]);
        const wipRow = displayRows[0];
        if (wipRow?.kind !== 'wip') { throw new Error('Expected WIP row.'); }

        const markup = renderToStaticMarkup(
            <GraphWIPRow
                wip={wipRow.wip}
                laneData={wipRow.laneData}
                rowHeight={rowHeight}
                style={{}}
                selected={false}
                onSelect={() => undefined}
            />,
        );

        expect(markup).toContain(`width="32" height="${rowHeight}"`);
        expect(markup).toContain(`x1="8" y1="0" x2="8" y2="${rowHeight}"`);
        expect(markup).toContain(`x1="24" y1="0" x2="24" y2="${rowHeight}"`);
        expect(markup).toContain('--graph-row-message-offset:36px');
    });
});

function laneData(lane: number): LaneData {
    return {
        lane,
        color: '#79b8ff',
        isPrimary: false,
        lines: [],
    };
}
