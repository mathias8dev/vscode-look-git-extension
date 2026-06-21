import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorktreeWip } from '@protocol/graph/types';
import { GraphWIPRow } from '@webview/features/graph/GraphWIPRow';
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
});

function laneData(lane: number): LaneData {
    return {
        lane,
        color: '#79b8ff',
        isPrimary: false,
        lines: [],
    };
}
