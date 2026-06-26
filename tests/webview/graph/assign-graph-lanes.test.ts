import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '@protocol/graph/types';
import { assignLanes, getMaxLane, type GraphRow } from '@webview/features/graph/layout/assign-graph-lanes';
import { expectItem } from '@tests/helpers/assertions';
import { findAdjacentDisconnectedSameLaneIssues, findCommitLanePassThroughIssues, findFloatingNodeIssues, findLaneContinuityIssues, findNonVisibleLineTargetIssues } from '@tests/helpers/graph-layout-assertions';

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

    it('preserves locked lanes when newly visible merge parents would otherwise take them', () => {
        const firstPage = assignLanes([
            commit('merge', ['base', 'topic-0', 'topic-1', 'topic-2', 'topic-3']),
            commit('topic-3', ['base']),
            commit('topic-2', ['base']),
        ]);
        const lockedLanes = new Map(firstPage.map((row) => [row.commit.hash, row.laneData.lane]));

        const expanded = assignLanes([
            commit('merge', ['base', 'topic-0', 'topic-1', 'topic-2', 'topic-3']),
            commit('topic-3', ['base']),
            commit('topic-2', ['base']),
            commit('topic-1', ['base']),
            commit('topic-0', ['base']),
            commit('base'),
        ], { lockedLanes });

        for (const firstPageRow of firstPage) {
            const expandedRow = expanded.find((row) => row.commit.hash === firstPageRow.commit.hash);
            expect(expandedRow?.laneData.lane).toBe(firstPageRow.laneData.lane);
        }
        expect(findFloatingNodeIssues(expanded)).toEqual([]);
        expect(findLaneContinuityIssues(expanded)).toEqual([]);
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

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1, 0]);
        expect(getMaxLane(rows)).toBe(1);
        expect(expectItem(rows, 1).laneData.lines).not.toContainEqual(expect.objectContaining({
            targetHash: 'hidden-a',
            role: 'pass-through',
        }));
        expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    });

    it('does not allocate lanes for hidden merge parents', () => {
        const rows = assignLanes([
            commit('merge', ['hidden-main', 'hidden-feature']),
            commit('next', ['hidden-next']),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1]);
        expect(getMaxLane(rows)).toBe(1);
        expect(expectItem(rows, 0).laneData.lines).not.toContainEqual(expect.objectContaining({
            targetHash: 'hidden-feature',
        }));
        expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    });

    it('does not draw a dangling edge to a hidden first parent', () => {
        const rows = assignLanes([
            commit('visible-child', ['hidden-parent']),
            commit('unrelated', ['unrelated-parent']),
        ]);

        expect(expectItem(rows, 0).laneData.lines).toEqual([]);
        expect(expectItem(rows, 1).laneData.lines).toEqual([]);
        expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    });

    it('can draw an untargeted boundary edge for hidden first parents when more history exists', () => {
        const rows = assignLanes([
            commit('visible-child', ['hidden-parent']),
        ], { showHiddenParentBoundaryEdges: true });

        const boundaryLine = expectItem(rows, 0).laneData.lines.find((line) => line.role === 'first-parent');

        expect(boundaryLine).toEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        }));
        expect(boundaryLine).not.toHaveProperty('targetHash');
        expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
    });

    it('does not stack unrelated visible dots on the same lane with a visual gap', () => {
        const rows = assignLanes([
            commit('visible-a', ['hidden-a']),
            commit('visible-b', ['hidden-b']),
            commit('visible-c', ['hidden-c']),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1, 0]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    });

    it('opens lanes progressively for many branches sharing the same parent', () => {
        const rows = assignLanes([
            commit('branch-a', ['base']),
            commit('branch-b', ['base']),
            commit('branch-c', ['base']),
            commit('branch-d', ['base']),
            commit('base'),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1, 2, 1, 0]);
        expect(getMaxLane(rows)).toBe(2);
        expect(expectItem(rows, 3).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 1,
            toLane: 0,
            role: 'first-parent',
        }));
        expectSemanticLayout(rows);
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

    it('connects a node when an incoming lane joins an already-active first-parent lane', () => {
        const rows = assignLanes([
            commit('topic-child', ['topic-parent']),
            commit('main-child', ['base']),
            commit('topic-parent', ['base']),
            commit('base'),
        ]);

        const topicParent = expectItem(rows, 2);
        expect(topicParent.laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            type: 'straight',
            role: 'pass-through',
            startY: 'top',
            endY: 'center',
        }));
        expect(topicParent.laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 1,
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        }));
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('compacts remaining lanes after a left lane is consumed', () => {
        const rows = assignLanes([
            commit('tip-a', ['root-a']),
            commit('tip-b', ['root-b']),
            commit('tip-c', ['root-c']),
            commit('root-a'),
            commit('root-b'),
            commit('root-c'),
        ]);

        expect(rows.map((row) => row.laneData.lane)).toEqual([0, 1, 2, 0, 1, 0]);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    });

    it('does not produce floating nodes in a dense criss-cross topology', () => {
        const rows = assignLanes([
            commit('feature-b-tip', ['feature-b-mid']),
            commit('feature-a-tip', ['join-a'], ['feature/a']),
            commit('main-2', ['main-1'], ['HEAD -> main']),
            commit('feature-b-mid', ['join-a']),
            commit('main-1', ['base']),
            commit('join-a', ['base']),
            commit('side-2', ['side-1']),
            commit('side-1', ['base']),
            commit('base'),
        ], { primaryBranch: 'main' });

        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('keeps row-to-row lane continuity in a wide generated topology', () => {
        const commits = [
            commit('topic-a3', ['topic-a2']),
            commit('topic-b2', ['join-1']),
            commit('main-4', ['main-3'], ['HEAD -> main']),
            commit('topic-c2', ['join-2']),
            commit('topic-a2', ['join-1']),
            commit('main-3', ['main-2']),
            commit('topic-d2', ['topic-d1']),
            commit('join-2', ['join-1']),
            commit('topic-d1', ['base']),
            commit('main-2', ['base']),
            commit('join-1', ['base']),
            commit('base'),
        ];

        const rows = assignLanes(commits, { primaryBranch: 'main' });

        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });

    it('does not leave roots stranded on old far-right lanes in a large independent topology', () => {
        const branchCount = 32;
        const tips = Array.from({ length: branchCount }, (_, i) => commit(`tip-${i}`, [`root-${i}`]));
        const roots = Array.from({ length: branchCount }, (_, i) => commit(`root-${i}`));
        const rows = assignLanes([...tips, ...roots]);

        expect(rows.slice(branchCount).map((row) => row.laneData.lane)).toEqual(Array.from({ length: branchCount }, (_, index) => index % 2));
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
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
        expect(rows.map((r) => r.laneData.lane)).toEqual([0, 0, 1, 1]);
        expect(getMaxLane(rows)).toBe(1);
        expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
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

    it('consumes incoming lanes for the primary branch tip', () => {
        const rows = assignLanes([
            commit('feature-tip', ['main-tip'], ['feature/ui']),
            commit('main-tip', ['base'], ['HEAD -> main']),
            commit('base'),
        ], { primaryBranch: 'main' });

        expect(expectItem(rows, 1).laneData.lane).toBe(0);
        expect(expectItem(rows, 1).laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 0,
            toLane: 0,
            targetHash: 'base',
            role: 'first-parent',
        }));
        expect(expectItem(rows, 2).laneData.lines).not.toContainEqual(expect.objectContaining({
            targetHash: 'main-tip',
            role: 'pass-through',
        }));
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
        expect(getMaxLane(rows)).toBe(0);
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

    it('keeps semantic layout invariants on generated merge-heavy histories', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const rows = assignLanes(generatedDagCommits(seed, 220), { primaryBranch: 'main' });
            expectSemanticLayout(rows);
        }
    });

    it('keeps semantic layout invariants with sparse filters and pagination locks', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const commits = sparseFilter(generatedDagCommits(seed, 260), seed);
            const firstPageRows = assignLanes(commits.slice(0, 45), { primaryBranch: 'main' });
            const lockedLanes = new Map(firstPageRows.map((row) => [row.commit.hash, row.laneData.lane]));
            const expandedRows = assignLanes(commits.slice(0, 160), { primaryBranch: 'main', lockedLanes });

            for (const firstPageRow of firstPageRows) {
                const expandedRow = expandedRows.find((row) => row.commit.hash === firstPageRow.commit.hash);
                if (expandedRow?.laneData.lane !== firstPageRow.laneData.lane) {
                    throw new Error(`Expected locked lane for ${firstPageRow.commit.hash} in seed ${seed}: ${firstPageRow.laneData.lane}, received ${expandedRow?.laneData.lane}.`);
                }
            }
            expectSemanticLayout(firstPageRows);
            expectSemanticLayout(expandedRows);
        }
    });

    it('keeps semantic layout invariants on a large generated repository graph', () => {
        const commits = generatedDagCommits(97, 1200);
        const rows = assignLanes(commits, { primaryBranch: 'main' });
        expectSemanticLayout(rows);

        const filteredCommits = sparseFilter(commits, 97);
        const firstPageRows = assignLanes(filteredCommits.slice(0, 80), { primaryBranch: 'main' });
        const lockedLanes = new Map(firstPageRows.map((row) => [row.commit.hash, row.laneData.lane]));
        const expandedRows = assignLanes(filteredCommits.slice(0, 500), { primaryBranch: 'main', lockedLanes });

        for (const firstPageRow of firstPageRows) {
            const expandedRow = expandedRows.find((row) => row.commit.hash === firstPageRow.commit.hash);
            if (expandedRow?.laneData.lane !== firstPageRow.laneData.lane) {
                throw new Error(`Expected locked lane for ${firstPageRow.commit.hash}: ${firstPageRow.laneData.lane}, received ${expandedRow?.laneData.lane}.`);
            }
        }
        expectSemanticLayout(firstPageRows);
        expectSemanticLayout(expandedRows);
    });

    it('keeps stacked dots connected across incremental pagination locks', () => {
        // Regression: each "load more" re-locks every visible row's lane (see
        // graphState.applyGraphData) and appends the next page. When a new page
        // reveals the parent that occupies the row immediately below a commit,
        // lane contention used to push that parent out to a free lane and weave
        // it back — leaving two dots stacked on the same lane with no straight
        // connector between them. Replay that exact loop and assert the layout
        // stays clean at every page. These seeds each produced a same-lane
        // disconnect before the fix.
        for (const seed of [108, 187, 199, 338, 360, 373, 388]) {
            const commits = paginationDag(seed, 250);
            const pageSize = 25;
            let lockedLanes: ReadonlyMap<string, number> | undefined;
            for (let end = pageSize; end <= commits.length; end += pageSize) {
                const rows = assignLanes(commits.slice(0, end), { primaryBranch: 'main', lockedLanes });
                expectSemanticLayout(rows);
                lockedLanes = new Map(rows.map((row) => [row.commit.hash, row.laneData.lane]));
            }
        }
    });

    it('stabilizes pagination pass-through detours instead of bouncing them left and right', () => {
        const rows = assignLanes([
            commit('tip', ['base']),
            commit('locked-a', ['a-parent']),
            commit('locked-b', ['b-parent']),
            commit('locked-c', ['c-parent']),
            commit('locked-d', ['d-parent']),
            commit('base'),
        ], {
            lockedLanes: new Map([
                ['locked-a', 1],
                ['locked-b', 0],
                ['locked-c', 1],
                ['locked-d', 0],
            ]),
            stabilizePassThroughDetours: true,
        });
        const baseCorridorLanes = rows
            .slice(1, 5)
            .flatMap((row) => row.laneData.lines
                .filter((line) => line.role === 'pass-through' && line.targetHash === 'base' && line.endY === 'bottom')
                .map((line) => line.toLane));

        expect(baseCorridorLanes).toEqual([0, 1, 2, 2]);
        expect(findFloatingNodeIssues(rows)).toEqual([]);
        expect(findLaneContinuityIssues(rows)).toEqual([]);
    });
});

function expectSemanticLayout(rows: readonly GraphRow[]): void {
    expect(findNonVisibleLineTargetIssues(rows)).toEqual([]);
    expect(findCommitLanePassThroughIssues(rows)).toEqual([]);
    expect(findAdjacentDisconnectedSameLaneIssues(rows)).toEqual([]);
    expect(findFloatingNodeIssues(rows)).toEqual([]);
    expect(findLaneContinuityIssues(rows)).toEqual([]);
}

function paginationDag(seed: number, count: number): readonly GraphCommit[] {
    const random = seededRandom(seed);
    const oldestFirst: GraphCommit[] = [];
    for (let i = 0; i < count; i++) {
        const parents: string[] = [];
        if (i > 0) {
            const span = Math.min(i, 18);
            parents.push(`s${seed}-c${i - 1 - Math.floor(random() * span)}`);
            if (i > 4 && random() < 0.3) { parents.push(`s${seed}-c${Math.floor(random() * i)}`); }
            if (i > 16 && random() < 0.05) { parents.push(`s${seed}-c${Math.floor(random() * i)}`); }
            if (i > 24 && random() < 0.025) { parents.push(`s${seed}-c${Math.floor(random() * i)}`); }
        }
        oldestFirst.push(commit(`s${seed}-c${i}`, Array.from(new Set(parents))));
    }
    return oldestFirst.reverse();
}

function generatedDagCommits(seed: number, count: number): readonly GraphCommit[] {
    const random = seededRandom(seed);
    const oldestFirst: GraphCommit[] = [];
    for (let i = 0; i < count; i++) {
        const parents: string[] = [];
        if (i > 0) {
            const span = Math.min(i, 18);
            parents.push(hashFor(seed, i - 1 - Math.floor(random() * span)));
            if (i > 8 && random() < 0.34) {
                parents.push(hashFor(seed, Math.floor(random() * i)));
            }
            if (i > 32 && random() < 0.12) {
                parents.push(hashFor(seed, Math.floor(random() * i)));
            }
        }
        const hash = hashFor(seed, i);
        const refs = i === count - 1 ? ['HEAD -> main'] : [];
        oldestFirst.push(commit(hash, Array.from(new Set(parents)), refs));
    }
    return oldestFirst.reverse();
}

function sparseFilter(commits: readonly GraphCommit[], seed: number): readonly GraphCommit[] {
    return commits.filter((_, index) => index < 8 || index % 7 === seed % 7 || index % 19 === seed % 11);
}

function hashFor(seed: number, index: number): string {
    return `s${seed}-c${index}`;
}

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}
