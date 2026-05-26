import { describe, expect, it } from 'vitest';
import { assignLanes, getMaxLane } from '../src/graphView/graphLaneAssigner';
import type { GraphCommitInfo } from '../src/gitService';

function commit(hash: string, parents: string[] = []): GraphCommitInfo {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: hash,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: new Date('2024-01-01T00:00:00Z'),
        parentHashes: parents,
        refs: [],
    };
}

describe('graphLaneAssigner', () => {
    it('keeps a linear history on a single lane', () => {
        const rows = assignLanes([
            commit('c3', ['c2']),
            commit('c2', ['c1']),
            commit('c1'),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 0, 0]);
        expect(getMaxLane(rows)).toBe(0);
        expect(rows[0].laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            type: 'straight',
        }));
    });

    it('allocates additional lanes for independent branch tips', () => {
        const rows = assignLanes([
            commit('feature', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]);

        expect(rows[0].laneData.lane).toBe(0);
        expect(rows[1].laneData.lane).toBe(1);
        expect(getMaxLane(rows)).toBe(1);
    });

    it('draws a merge/fork line for merge commits', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature']),
            commit('main', ['base']),
            commit('feature', ['base']),
            commit('base'),
        ]);

        const firstRowLineTypes = rows[0].laneData.lines.map((line) => line.type);
        expect(firstRowLineTypes).toContain('fork-right');
        expect(getMaxLane(rows)).toBeGreaterThanOrEqual(1);
    });

    it('handles an empty commit list', () => {
        expect(assignLanes([])).toEqual([]);
        expect(getMaxLane([])).toBe(0);
    });
});

describe('graphLaneAssigner advanced cases', () => {
    it('handles an orphan root commit (no parents) on lane 0', () => {
        const rows = assignLanes([commit('orphan')]);
        expect(rows).toHaveLength(1);
        expect(rows[0].laneData.lane).toBe(0);
        expect(rows[0].laneData.lines).toEqual([]);
    });

    it('draws pass-through straight lines for active lanes not touched by a commit', () => {
        const rows = assignLanes([
            commit('feature', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]);

        // 'main' row (index 1) sits on lane 1; lane 0 (feature) is still active and should pass through
        const mainRow = rows[1];
        const passThrough = mainRow.laneData.lines.find(
            (line) => line.type === 'straight' && line.fromLane !== mainRow.laneData.lane,
        );
        expect(passThrough).toBeDefined();
    });

    it('assigns unique colors to branches that stay in separate lanes simultaneously', () => {
        // Give each tip a distinct parent so all three lanes remain active at the same time
        const rows = assignLanes([
            commit('a', ['root1']),
            commit('b', ['root2']),
            commit('c', ['root3']),
            commit('root1'),
            commit('root2'),
            commit('root3'),
        ]);

        const tipColors = rows.slice(0, 3).map((row) => row.laneData.color);
        expect(new Set(tipColors).size).toBe(3);
    });

    it('wraps colors gracefully when more branches than palette entries exist', () => {
        const tips = Array.from({ length: 11 }, (_, i) => commit(`c${i}`, [`root${i}`]));
        const roots = Array.from({ length: 11 }, (_, i) => commit(`root${i}`));
        const rows = assignLanes([...tips, ...roots]);

        expect(rows.slice(0, 11).map((row) => row.laneData.lane)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(new Set(rows.slice(0, 10).map((row) => row.laneData.color)).size).toBe(10);
        expect(rows[10].laneData.color).toBe(rows[0].laneData.color);
    });

    it('bounds the maximum lane count for a simple two-branch merge', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature']),
            commit('feature', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]);

        expect(getMaxLane(rows)).toBe(1);
    });

    it('generates a fork-right line for the second parent of a merge commit', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature']),
            commit('main', ['base']),
            commit('feature', ['base']),
            commit('base'),
        ]);

        const mergeRow = rows[0];
        expect(mergeRow.laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 1,
            type: 'fork-right',
        }));
    });

    it('allocates one visible lane per additional parent for octopus merges', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature-a', 'feature-b']),
            commit('main', ['base']),
            commit('feature-a', ['base']),
            commit('feature-b', ['base']),
            commit('base'),
        ]);

        const mergeLines = rows[0].laneData.lines.filter((line) => line.type === 'fork-right');
        expect(mergeLines).toHaveLength(2);
        expect(mergeLines.map((line) => line.toLane)).toEqual([1, 2]);
        expect(getMaxLane(rows)).toBe(2);
    });

    it('reuses a freed lane after a branch tip has been consumed', () => {
        const rows = assignLanes([
            commit('feature-a', ['base-a']),
            commit('base-a'),
            commit('feature-b', ['base-b']),
            commit('base-b'),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 0, 0, 0]);
        expect(getMaxLane(rows)).toBe(0);
    });
});
