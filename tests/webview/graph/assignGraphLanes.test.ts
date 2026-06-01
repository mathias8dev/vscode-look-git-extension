import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '../../../src/protocol/graph/types';
import { assignLanes, getMaxLane } from '../../../src/webview/features/graph/layout/assignGraphLanes';
import { expectItem } from '../../helpers/assertions';

function commit(hash: string, parents: string[] = [], refs: string[] = []): GraphCommit {
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

describe('assignGraphLanes', () => {
    it('keeps a linear history on a single lane', () => {
        const rows = assignLanes([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1')]);
        expect(rows.map((r) => r.laneData.lane)).toEqual([0, 0, 0]);
        expect(getMaxLane(rows)).toBe(0);
        expect(expectItem(rows, 0).laneData.lines).toContainEqual(expect.objectContaining({ fromLane: 0, toLane: 0, type: 'straight' }));
    });

    it('starts tip edges at the commit dot and ends root edges at the commit dot', () => {
        const rows = assignLanes([commit('tip', ['root']), commit('root')]);
        expect(expectItem(rows, 0).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            type: 'straight',
            startY: 'center',
            endY: 'bottom',
        }));
        expect(expectItem(rows, 1).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            type: 'straight',
            startY: 'top',
            endY: 'center',
        }));
    });

    it('allocates additional lanes for independent branch tips', () => {
        const rows = assignLanes([commit('feature', ['base']), commit('main', ['base']), commit('base')]);
        expect(expectItem(rows, 0).laneData.lane).toBe(0);
        expect(expectItem(rows, 1).laneData.lane).toBe(1);
        expect(getMaxLane(rows)).toBe(1);
    });

    it('keeps overlapping visible lanes compact', () => {
        const rows = assignLanes([
            commit('short', ['root']),
            commit('long-3', ['long-2']),
            commit('long-2', ['long-1']),
            commit('long-1', ['root']),
            commit('root'),
        ]);

        expect(getMaxLane(rows)).toBe(1);
        expect(expectItem(rows, 0).laneData.lane).toBe(0);
        expect(expectItem(rows, 1).laneData.lane).toBe(1);
        expect(expectItem(rows, 2).laneData.lane).toBe(1);
        expect(expectItem(rows, 3).laneData.lane).toBe(1);
    });

    it('preserves locked lanes when the lane is still available after appending older commits', () => {
        const firstPage = assignLanes([
            commit('main-tip', ['main-parent']),
        ]);
        const lockedLanes = new Map(firstPage.map((row) => [row.commit.hash, row.laneData.lane]));

        const expanded = assignLanes([
            commit('main-tip', ['main-parent']),
            commit('feature-tip', ['feature-parent']),
            commit('main-parent', ['root']),
            commit('feature-parent', ['root']),
            commit('root'),
        ], { lockedLanes });

        expect(expectItem(expanded, 0).laneData.lane).toBe(expectItem(firstPage, 0).laneData.lane);
    });

    it('draws a merge/fork line for merge commits', () => {
        const rows = assignLanes([commit('merge', ['main', 'feature']), commit('main', ['base']), commit('feature', ['base']), commit('base')]);
        expect(expectItem(rows, 0).laneData.lines.map((l) => l.type)).toContain('fork-right');
        expect(getMaxLane(rows)).toBeGreaterThanOrEqual(1);
    });

    it('handles an empty commit list', () => {
        expect(assignLanes([])).toEqual([]);
        expect(getMaxLane([])).toBe(0);
    });

    it('handles an orphan root commit on lane 0', () => {
        const rows = assignLanes([commit('orphan')]);
        expect(rows).toHaveLength(1);
        const row = expectItem(rows, 0);
        expect(row.laneData.lane).toBe(0);
        expect(row.laneData.lines).toEqual([]);
    });

    it('does not keep off-page parents as active lanes', () => {
        const rows = assignLanes([
            commit('tip-a', ['hidden-a']),
            commit('tip-b', ['hidden-b']),
            commit('tip-c', ['hidden-c']),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 0, 0]);
        expect(getMaxLane(rows)).toBe(0);
        expect(expectItem(rows, 1).laneData.lines).not.toContainEqual(expect.objectContaining({
            targetHash: 'hidden-a',
            role: 'pass-through',
        }));
    });

    it('does not allocate lanes for hidden merge parents', () => {
        const rows = assignLanes([
            commit('merge', ['hidden-main', 'hidden-feature']),
            commit('next', ['hidden-next']),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 0]);
        expect(getMaxLane(rows)).toBe(0);
        expect(expectItem(rows, 0).laneData.lines).not.toContainEqual(expect.objectContaining({
            targetHash: 'hidden-feature',
        }));
    });

    it('opens lanes progressively for many branches sharing the same parent', () => {
        const rows = assignLanes([
            commit('branch-a', ['base']),
            commit('branch-b', ['base']),
            commit('branch-c', ['base']),
            commit('branch-d', ['base']),
            commit('base'),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1, 1, 1, 0]);
        expect(getMaxLane(rows)).toBe(1);
        expect(expectItem(rows, 3).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 1,
            toLane: 0,
            role: 'first-parent',
        }));
    });

    it('draws pass-through straight lines for active lanes not touched by a commit', () => {
        const rows = assignLanes([commit('feature', ['base']), commit('main', ['base']), commit('base')]);
        const mainRow = expectItem(rows, 1);
        const passThrough = mainRow.laneData.lines.find((l) => l.type === 'straight' && l.fromLane !== mainRow.laneData.lane);
        expect(passThrough).toBeDefined();
    });

    it('assigns unique colors to simultaneous branches', () => {
        const rows = assignLanes([commit('a', ['r1']), commit('b', ['r2']), commit('c', ['r3']), commit('r1'), commit('r2'), commit('r3')]);
        const tipColors = rows.slice(0, 3).map((r) => r.laneData.color);
        expect(new Set(tipColors).size).toBe(3);
    });

    it('wraps colors gracefully beyond palette size', () => {
        const tips = Array.from({ length: 11 }, (_, i) => commit(`c${i}`, [`r${i}`]));
        const roots = Array.from({ length: 11 }, (_, i) => commit(`r${i}`));
        const rows = assignLanes([...tips, ...roots]);
        expect(expectItem(rows, 10).laneData.color).toBe(expectItem(rows, 0).laneData.color);
    });

    it('bounds max lane for a simple two-branch merge', () => {
        const rows = assignLanes([commit('merge', ['main', 'feature']), commit('feature', ['base']), commit('main', ['base']), commit('base')]);
        expect(getMaxLane(rows)).toBe(1);
    });

    it('generates a fork-right line for the second parent', () => {
        const rows = assignLanes([commit('merge', ['main', 'feature']), commit('main', ['base']), commit('feature', ['base']), commit('base')]);
        expect(expectItem(rows, 0).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 1,
            type: 'fork-right',
            startY: 'center',
            endY: 'bottom',
        }));
    });

    it('joins an already-active first-parent lane instead of reserving a duplicate corridor', () => {
        const rows = assignLanes([commit('feature', ['base']), commit('main', ['base']), commit('base')]);
        expect(expectItem(rows, 1).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 1,
            toLane: 0,
            type: 'merge-left',
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        }));
        expect(expectItem(rows, 2).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            type: 'straight',
            role: 'pass-through',
            startY: 'top',
            endY: 'center',
        }));
    });

    it('allocates one lane per additional parent in octopus merge', () => {
        const rows = assignLanes([
            commit('merge', ['main', 'feature-a', 'feature-b']),
            commit('main', ['base']), commit('feature-a', ['base']), commit('feature-b', ['base']), commit('base'),
        ]);
        const forks = expectItem(rows, 0).laneData.lines.filter((l) => l.type === 'fork-right');
        expect(forks).toHaveLength(2);
        expect(getMaxLane(rows)).toBe(2);
    });

    it('reuses a freed lane after a branch is consumed', () => {
        const rows = assignLanes([commit('a', ['ra']), commit('ra'), commit('b', ['rb']), commit('rb')]);
        expect(rows.map((r) => r.laneData.lane)).toEqual([0, 0, 0, 0]);
    });

    it('marks the primary branch first-parent chain', () => {
        const rows = assignLanes([
            commit('feature-tip', ['shared'], ['feature/ui']),
            commit('main-tip', ['main-parent'], ['HEAD -> main']),
            commit('main-parent', ['shared']),
            commit('shared'),
        ], { primaryBranch: 'main' });
        expect(rows.map((r) => r.laneData.lane)).toEqual([0, 1, 1, 0]);
        expect(expectItem(rows, 1).laneData.isPrimary).toBe(true);
        expect(expectItem(rows, 2).laneData.isPrimary).toBe(true);
        expect(expectItem(rows, 3).laneData.isPrimary).toBe(true);
    });

    it('uses hash to mark the primary branch when refs are missing', () => {
        const rows = assignLanes([
            commit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['base-a']),
            commit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', ['base-b']),
            commit('base-a'), commit('base-b'),
        ], { primaryBranchHash: 'bbbbbbb' });
        expect(expectItem(rows, 0).laneData.lane).toBe(0);
        expect(expectItem(rows, 1).laneData.lane).toBe(1);
        expect(expectItem(rows, 1).laneData.isPrimary).toBe(true);
        expect(expectItem(rows, 3).laneData.isPrimary).toBe(true);
    });

    it('keeps the primary lane stable when older commits are appended', () => {
        const firstPage = [commit('main-tip', ['main-parent'], ['HEAD -> main']), commit('feature-tip', ['fp'], ['feature/ui'])];
        const firstRows = assignLanes(firstPage, { primaryBranch: 'main' });
        const extendedRows = assignLanes([...firstPage, commit('main-parent', ['root']), commit('fp', ['root']), commit('root')], { primaryBranch: 'main' });
        expect(expectItem(extendedRows, 0).laneData.lane).toBe(expectItem(firstRows, 0).laneData.lane);
        expect(expectItem(extendedRows, 0).laneData.isPrimary).toBe(true);
    });
});
