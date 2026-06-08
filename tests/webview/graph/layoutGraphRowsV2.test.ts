import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '../../../src/protocol/graph/types';
import { layoutGraphRowsV2 } from '../../../src/webview/features/graph/layout/layoutGraphRowsV2';
import { findFloatingNodeIssues, findLaneContinuityIssues } from '../../helpers/graphLayoutAssertions';

function commit(hash: string, parents: readonly string[] = [], refs: readonly string[] = []): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: hash,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: parents,
        refs,
    };
}

describe('layoutGraphRowsV2', () => {
    it('extends from persistent boundary state without relaying out existing rows', () => {
        const first = layoutGraphRowsV2([
            commit('tip', ['base']),
            commit('side', ['side-base']),
        ], { showHiddenParentBoundaryEdges: true });
        const originalRows = first.rows;

        const extended = layoutGraphRowsV2([
            commit('base'),
            commit('side-base'),
        ], { previous: first });

        expect(extended.rows.slice(0, originalRows.length).map((row) => row.commit.hash)).toEqual(originalRows.map((row) => row.commit.hash));
        expect(extended.rows.slice(0, originalRows.length).map((row) => row.laneData.lane)).toEqual(originalRows.map((row) => row.laneData.lane));
        expect(extended.rows.map((row) => row.commit.hash)).toEqual(['tip', 'side', 'base', 'side-base']);
        expect(findFloatingNodeIssues(extended.rows)).toEqual([]);
        expect(findLaneContinuityIssues(extended.rows)).toEqual([]);
    });

    it('uses the first-parent spine as the preferred incoming lane', () => {
        const rows = layoutGraphRowsV2([
            commit('merge', ['main', 'topic']),
            commit('topic', ['base']),
            commit('main', ['base'], ['HEAD -> main']),
            commit('base'),
        ], { primaryBranch: 'main' }).rows;

        const main = rows.find((row) => row.commit.hash === 'main');

        expect(main?.laneData.isPrimary).toBe(true);
        expect(main?.laneData.lane).toBe(0);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('hydrates hidden octopus merge parents when a later page reveals them', () => {
        const parents = ['base', ...Array.from({ length: 16 }, (_, index) => `topic-${index}`)];
        const first = layoutGraphRowsV2([
            commit('merge', parents),
            commit('topic-15', ['base']),
            commit('topic-14', ['base']),
            commit('topic-13', ['base']),
            commit('topic-12', ['base']),
            commit('topic-11', ['base']),
        ], { showHiddenParentBoundaryEdges: true });

        expect(findFloatingNodeIssues(first.rows)).toEqual([]);
        expect(findLaneContinuityIssues(first.rows)).toEqual([]);

        const extended = layoutGraphRowsV2([
            commit('topic-10', ['base']),
            commit('topic-9', ['base']),
            commit('topic-8', ['base']),
            commit('topic-7', ['base']),
            commit('topic-6', ['base']),
            commit('topic-5', ['base']),
            commit('topic-4', ['base']),
            commit('topic-3', ['base']),
            commit('topic-2', ['base']),
            commit('topic-1', ['base']),
            commit('topic-0', ['base']),
            commit('base'),
        ], { previous: first });

        expect(extended.rows.slice(0, first.rows.length).map((row) => row.laneData.lane)).toEqual(first.rows.map((row) => row.laneData.lane));
        expect(findFloatingNodeIssues(extended.rows)).toEqual([]);
        expect(findLaneContinuityIssues(extended.rows)).toEqual([]);
    });

    it('allocates newly opened merge-parent lanes to the right of the merge commit', () => {
        const rows = layoutGraphRowsV2([
            commit('merge', ['main', 'topic-a', 'topic-b']),
            commit('topic-b', ['base']),
            commit('topic-a', ['base']),
            commit('main', ['base'], ['HEAD -> main']),
            commit('base'),
        ], { primaryBranch: 'main' }).rows;
        const merge = rows.find((row) => row.commit.hash === 'merge');
        expect(merge).toBeDefined();
        if (!merge) { throw new Error('Expected merge row.'); }

        const mergeParentLanes = merge?.laneData.lines
            .filter((line) => line.role === 'merge-parent' && line.startY === 'center')
            .map((line) => line.toLane);

        expect(merge?.laneData.lane).toBe(0);
        expect(mergeParentLanes?.every((lane) => lane > merge.laneData.lane)).toBe(true);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('reroutes hydrated boundary corridors to the right when preserved rows already use their lanes', () => {
        const first = layoutGraphRowsV2([
            commit('merge', ['main', 'hidden-a', 'hidden-b']),
            commit('main', ['main-parent']),
        ], { showHiddenParentBoundaryEdges: true });

        const extended = layoutGraphRowsV2([
            commit('hidden-b'),
            commit('hidden-a'),
            commit('main-parent'),
        ], { previous: first });
        const merge = extended.rows.find((row) => row.commit.hash === 'merge');
        const hydratedLanes = merge?.laneData.lines
            .filter((line) => line.targetHash === 'hidden-a' || line.targetHash === 'hidden-b')
            .map((line) => line.toLane);

        expect(hydratedLanes?.every((lane) => lane > 0)).toBe(true);
        expect(findFloatingNodeIssues(extended.rows)).toEqual([]);
        expect(findLaneContinuityIssues(extended.rows)).toEqual([]);
    });

    it('keeps hidden parent corridors visible through intervening rows', () => {
        const rows = layoutGraphRowsV2([
            commit('merge', ['main', 'hidden-topic']),
            commit('main-child', ['main']),
            commit('main', ['base']),
        ], { showHiddenParentBoundaryEdges: true }).rows;

        const mainChild = rows.find((row) => row.commit.hash === 'main-child');
        const hiddenPassThrough = mainChild?.laneData.lines.find((line) => line.startY === 'top'
            && line.endY === 'bottom'
            && line.role === 'pass-through'
            && !line.targetHash);

        expect(hiddenPassThrough).toBeDefined();
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('appends unprocessed merge-parent columns after existing output swimlanes', () => {
        const rows = layoutGraphRowsV2([
            commit('child', ['merge']),
            commit('tip', ['base']),
            commit('side', ['side-parent']),
            commit('merge', ['base', 'topic']),
            commit('topic'),
            commit('base'),
        ], { showHiddenParentBoundaryEdges: true }).rows;
        const merge = rows.find((row) => row.commit.hash === 'merge');
        expect(merge).toBeDefined();
        if (!merge) { throw new Error('Expected merge row.'); }

        const topicEdge = merge.laneData.lines.find((line) => line.targetHash === 'topic');
        const passThroughLanes = merge.laneData.lines
            .filter((line) => line.role === 'pass-through' && line.endY === 'bottom')
            .map((line) => line.toLane);

        expect(passThroughLanes).toEqual([1, 2]);
        expect(topicEdge?.toLane).toBe(3);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('keeps the first-parent edge on its replacement lane when duplicate parent lanes exist', () => {
        const rows = layoutGraphRowsV2([
            commit('merge', ['main', 'topic']),
            commit('topic', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]).rows;
        const main = rows.find((row) => row.commit.hash === 'main');
        expect(main).toBeDefined();
        if (!main) { throw new Error('Expected main row.'); }

        const firstParentLine = main.laneData.lines.find((line) => line.role === 'first-parent' && line.targetHash === 'base');

        expect(firstParentLine).toEqual(expect.objectContaining({
            fromLane: main.laneData.lane,
            toLane: main.laneData.lane,
        }));
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });
});
