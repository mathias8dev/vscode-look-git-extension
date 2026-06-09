import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '../../../src/protocol/graph/types';
import { getMaxLane } from '../../../src/webview/features/graph/layout/graph-lane-model';
import { layoutGraphRowsV3 } from '../../../src/webview/features/graph/layout/layout-graph-rows-v3';
import {
    findAdjacentDisconnectedSameLaneIssues,
    findCommitLanePassThroughIssues,
    findFloatingNodeIssues,
    findLaneContinuityIssues,
    findNonVisibleLineTargetIssues,
} from '../../helpers/graphLayoutAssertions';

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

function generatedCommits(seed: number, count: number): readonly GraphCommit[] {
    const random = seededRandom(seed);
    return Array.from({ length: count }, (_, index) => {
        const parents: string[] = [];
        if (index + 1 < count) {
            parents.push(`c${index + 1}`);
        }
        if (index + 3 < count && random() < 0.22) {
            parents.push(`c${index + 3 + Math.floor(random() * Math.min(20, count - index - 3))}`);
        }
        if (index + 8 < count && random() < 0.08) {
            parents.push(`c${index + 8 + Math.floor(random() * Math.min(45, count - index - 8))}`);
        }
        return commit(`c${index}`, [...new Set(parents)]);
    });
}

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function expectNoLayoutIssues(rows: ReturnType<typeof layoutGraphRowsV3>['rows']): void {
    expect(findLaneContinuityIssues(rows)).toEqual([]);
    expect(findCommitLanePassThroughIssues(rows)).toEqual([]);
    expect(findFloatingNodeIssues(rows)).toEqual([]);
    expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
    expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
}

describe('layoutGraphRowsV3', () => {
    it('keeps already-loaded commit lanes while relayouting an expanded prefix', () => {
        const first = layoutGraphRowsV3([
            commit('merge', ['main', 'feature']),
            commit('main', ['base']),
        ], { showHiddenParentBoundaryEdges: true, checkpointInterval: 2 });
        const lanesBefore = new Map(first.rows.map((row) => [row.commit.hash, row.laneData.lane]));

        const extended = layoutGraphRowsV3([
            { ...commit('merge', ['main', 'feature']), message: 'refreshed merge' },
            commit('main', ['base']),
            commit('feature', ['base']),
            commit('base'),
        ], { previous: first, showHiddenParentBoundaryEdges: true, checkpointInterval: 2 });

        expect(extended.rows.map((row) => row.commit.hash)).toEqual(['merge', 'main', 'feature', 'base']);
        expect(extended.rows[0]?.commit.message).toBe('refreshed merge');
        for (const [hash, lane] of lanesBefore) {
            expect(extended.rows.find((row) => row.commit.hash === hash)?.laneData.lane).toBe(lane);
        }
        expect(extended.checkpoints.map((checkpoint) => checkpoint.rowCount)).toEqual([2, 4]);
        expect(findFloatingNodeIssues(extended.rows)).toEqual([]);
        expect(findLaneContinuityIssues(extended.rows)).toEqual([]);
    });

    it('keeps common prefix lanes when the refreshed history diverges', () => {
        const first = layoutGraphRowsV3([
            commit('a5', ['a4']),
            commit('a4', ['a3']),
            commit('a3', ['a2']),
            commit('a2', ['a1']),
            commit('a1'),
        ], { checkpointInterval: 2 });

        const relaid = layoutGraphRowsV3([
            commit('a5', ['a4']),
            commit('a4', ['a3']),
            commit('a3', ['new-parent']),
            commit('new-parent'),
        ], { previous: first, checkpointInterval: 2 });

        expect(relaid.rows.map((row) => row.commit.hash)).toEqual(['a5', 'a4', 'a3', 'new-parent']);
        expect(relaid.rows.find((row) => row.commit.hash === 'a5')?.laneData.lane).toBe(first.rows[0]?.laneData.lane);
        expect(relaid.rows.find((row) => row.commit.hash === 'a4')?.laneData.lane).toBe(first.rows[1]?.laneData.lane);
        expect(findFloatingNodeIssues(relaid.rows)).toEqual([]);
        expect(findLaneContinuityIssues(relaid.rows)).toEqual([]);
    });

    it('keeps sparse hidden boundary corridors bounded for large filtered histories', () => {
        const sparse = Array.from({ length: 60 }, (_, index) => commit(`visible-${index}`, [`hidden-${index}`]));
        const rows = layoutGraphRowsV3(sparse, {
            showHiddenParentBoundaryEdges: true,
            hiddenBoundaryLaneLimit: 8,
        }).rows;

        expect(getMaxLane(rows)).toBeLessThanOrEqual(8);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('still expands visible octopus merge parents beyond the hidden boundary budget', () => {
        const parents = Array.from({ length: 12 }, (_, index) => `parent-${index}`);
        const rows = layoutGraphRowsV3([
            commit('merge', parents),
            ...parents.map((parent) => commit(parent)),
        ], {
            showHiddenParentBoundaryEdges: true,
            hiddenBoundaryLaneLimit: 2,
        }).rows;

        expect(rows[0]?.laneData.lines.filter((line) => line.role === 'merge-parent')).toHaveLength(11);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('maps many branch columns onto one shared parent without conflicting bottom targets', () => {
        const topics = Array.from({ length: 10 }, (_, index) => `topic-${index}`);
        const rows = layoutGraphRowsV3([
            commit('merge', ['base', ...topics]),
            ...[...topics].reverse().map((topic) => commit(topic, ['base'])),
            commit('base'),
        ]).rows;
        const base = rows.find((row) => row.commit.hash === 'base');

        expect(Math.max(...topics.map((topic) => rows.find((row) => row.commit.hash === topic)?.laneData.lane ?? 0))).toBeGreaterThanOrEqual(8);
        expect(base?.laneData.lines.filter((line) => line.targetHash === 'base' && line.endY === 'center')).toHaveLength(1);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('keeps load-more lanes stable when hidden merge parents become visible later', () => {
        const commits = generatedCommits(1, 80);
        let state = layoutGraphRowsV3(commits.slice(0, 12), {
            showHiddenParentBoundaryEdges: true,
            hiddenBoundaryLaneLimit: 80,
            checkpointInterval: 15,
        });
        expectNoLayoutIssues(state.rows);

        for (const limit of [25, 57, 80]) {
            const previousLanes = new Map(state.rows.map((row) => [row.commit.hash, row.laneData.lane]));
            state = layoutGraphRowsV3(commits.slice(0, limit), {
                previous: state,
                showHiddenParentBoundaryEdges: true,
                hiddenBoundaryLaneLimit: 80,
                checkpointInterval: 15,
            });

            for (const [hash, lane] of previousLanes) {
                expect(state.rows.find((row) => row.commit.hash === hash)?.laneData.lane).toBe(lane);
            }
            expectNoLayoutIssues(state.rows);
        }
    });
});
