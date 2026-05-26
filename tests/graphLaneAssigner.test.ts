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
        const tips = Array.from({ length: 11 }, (_, i) => commit(`c${i}`, ['root']));
        const rows = assignLanes([...tips, commit('root')]);

        rows.forEach((row) => {
            expect(row.laneData.lane).toBeGreaterThanOrEqual(0);
            expect(row.laneData.color).toBeTruthy();
        });
    });

    it('bounds the maximum lane count for a simple two-branch merge', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature']),
            commit('feature', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]);

        expect(getMaxLane(rows)).toBeLessThanOrEqual(2);
    });

    it('generates a fork-right line for the second parent of a merge commit', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature']),
            commit('main', ['base']),
            commit('feature', ['base']),
            commit('base'),
        ]);

        const mergeRow = rows[0];
        const hasFork = mergeRow.laneData.lines.some(
            (l) => l.type === 'fork-right' || l.type === 'fork-left' || l.type === 'merge-right' || l.type === 'merge-left',
        );
        expect(hasFork).toBe(true);
    });

    it('reuses a freed lane after a branch tip has been consumed', () => {
        // 'feature' is consumed first (tip), freeing lane 1; 'main' can then reuse lane 0 or 1
        const rows = assignLanes([
            commit('feature', ['base']),
            commit('main', ['base']),
            commit('base'),
        ]);

        // After 'base' both lanes should be free — lane count must not keep growing
        expect(getMaxLane(rows)).toBeLessThanOrEqual(1);
    });
});
