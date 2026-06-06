import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GraphCommitRow } from '../../../src/webview/features/graph/GraphRow';
import type { GraphRow } from '../../../src/webview/features/graph/layout/assignGraphLanes';

describe('GraphCommitRow', () => {
    it('offsets the commit message from the lanes used by that row', () => {
        const compact = renderToStaticMarkup(
            <GraphCommitRow
                row={rowWithLane(0)}
                branches={[]}
                selected={false}
                childHash={undefined}
                parentHash={undefined}
                canUndoCommit={false}
                canCherryPick={true}
                hasMultipleSelectedCommits={false}
                style={{}}
                onSelect={() => undefined}
                onMoveFocus={() => undefined}
                onOpenContextMenu={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );
        const wide = renderToStaticMarkup(
            <GraphCommitRow
                row={rowWithLane(2)}
                branches={[]}
                selected={false}
                childHash={undefined}
                parentHash={undefined}
                canUndoCommit={false}
                canCherryPick={true}
                hasMultipleSelectedCommits={false}
                style={{}}
                onSelect={() => undefined}
                onMoveFocus={() => undefined}
                onOpenContextMenu={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );

        expect(compact).toContain('--graph-row-message-offset:20px');
        expect(wide).toContain('--graph-row-message-offset:52px');
    });

    it('marks merge commits with the merge node renderer', () => {
        const markup = renderToStaticMarkup(
            <GraphCommitRow
                row={{ ...rowWithLane(0), commit: { ...rowWithLane(0).commit, parentHashes: ['left', 'right'] } }}
                branches={[]}
                selected={false}
                childHash={undefined}
                parentHash={undefined}
                canUndoCommit={false}
                canCherryPick={true}
                hasMultipleSelectedCommits={false}
                style={{}}
                onSelect={() => undefined}
                onMoveFocus={() => undefined}
                onOpenContextMenu={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );

        expect(markup).toContain('r="5.5"');
        expect(markup).toContain('r="2.5"');
    });

    it('passes the measured row height to the lane renderer', () => {
        const markup = renderToStaticMarkup(
            <GraphCommitRow
                row={rowWithLane(0)}
                branches={[]}
                selected={false}
                childHash={undefined}
                parentHash={undefined}
                canUndoCommit={false}
                canCherryPick={true}
                hasMultipleSelectedCommits={false}
                rowHeight={35}
                style={{ height: 35 }}
                onSelect={() => undefined}
                onMoveFocus={() => undefined}
                onOpenContextMenu={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );

        expect(markup).toContain('height="35"');
    });

    it('renders the full commit date including time and seconds', () => {
        const markup = renderToStaticMarkup(
            <GraphCommitRow
                row={rowWithDate('2024-05-06T07:08:09')}
                branches={[]}
                selected={false}
                childHash={undefined}
                parentHash={undefined}
                canUndoCommit={false}
                canCherryPick={true}
                hasMultipleSelectedCommits={false}
                style={{}}
                onSelect={() => undefined}
                onMoveFocus={() => undefined}
                onOpenContextMenu={() => undefined}
                onBranchDoubleClick={() => undefined}
            />,
        );

        expect(markup).toContain('2024-05-06 07:08:09');
    });
});

function rowWithLane(lane: number): GraphRow {
    return {
        commit: {
            hash: `commit-${lane}`,
            shortHash: `commit-${lane}`,
            message: `commit ${lane}`,
            authorName: 'Test User',
            authorEmail: 'test@example.com',
            authorDate: '2024-01-01T00:00:00Z',
            parentHashes: [],
            refs: [],
        },
        laneData: {
            lane,
            color: '#fff',
            isPrimary: false,
            lines: [],
        },
    };
}

function rowWithDate(authorDate: string): GraphRow {
    return {
        ...rowWithLane(0),
        commit: {
            ...rowWithLane(0).commit,
            authorDate,
        },
    };
}
