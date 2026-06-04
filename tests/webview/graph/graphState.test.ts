import { describe, expect, it } from 'vitest';
import { GraphOperationCategory, GraphOperationStatus } from '../../../src/protocol/graph/messages';
import type { BranchInfo, GraphCommit, GraphData, WorktreeWip } from '../../../src/protocol/graph/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { buildDisplayRows, createInitialGraphState, graphRequestId, reduceGraphState } from '../../../src/webview/features/graph/graphState';
import type { GraphRow, LaneData } from '../../../src/webview/features/graph/layout/assignGraphLanes';

function commit(hash: string, parents: readonly string[] = []): GraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: hash,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: parents,
        refs: [],
    };
}

function graphData(commits: readonly GraphCommit[], loadedCount: number, hasMore: boolean): GraphData {
    return {
        branches: [],
        tags: [],
        commits,
        currentBranch: 'main',
        currentUser: 'Test User',
        hasMore,
        loadedCount,
        totalCount: commits.length,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
        submodules: [],
    };
}

function branch(name: string): BranchInfo {
    return {
        name,
        isRemote: false,
        isCurrent: false,
        hash: `${name}-hash`,
    };
}

function wip(path: string, head: string): WorktreeWip {
    return {
        path,
        head,
        branch: undefined,
        staged: 1,
        unstaged: 0,
        untracked: 0,
        conflicts: 0,
    };
}

function row(hash: string, laneData: LaneData): GraphRow {
    return { commit: commit(hash), laneData };
}

function laneData(lines: LaneData['lines'] = []): LaneData {
    return {
        lane: 1,
        color: '#79b8ff',
        isPrimary: false,
        lines,
    };
}

describe('graphState', () => {
    it('tracks load-more requests and clears them when graph data arrives', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('b', ['a'])], 1, true),
            },
        });

        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });
        expect(loadingMore.loadingMore).toBe(true);

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 1),
                data: graphData([commit('b', ['a']), commit('a')], 2, false),
            },
        });

        expect(next.loadingMore).toBe(false);
        expect(next.loadedCount).toBe(2);
        expect(next.rows).toHaveLength(2);
        expect(next.hasMore).toBe(false);
    });

    it('keeps the current loaded window when an external graph refresh is requested', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('b', ['a']), commit('a')], 2, true),
            },
        });
        const filtered = reduceGraphState(loaded, { type: 'setFilters', filters: { search: 'needle' } });
        const refreshed = reduceGraphState(
            { ...filtered, loadedCount: 600, loading: false },
            { type: 'message', message: { type: 'graph/refreshRequested' } },
        );

        expect(refreshed.loading).toBe(true);
        expect(refreshed.loadingMore).toBe(false);
        expect(refreshed.loadedCount).toBe(600);
        expect(refreshed.filters).toEqual({ search: 'needle' });
    });

    it('ignores commit details responses for commits that are no longer selected', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'selected' });
        const stale = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/commitDetailsResponse',
                requestId: 'details-1',
                hash: 'stale',
                fullMessage: 'old details',
                files: [],
            },
        });

        expect(stale.selectedHash).toBe('selected');
        expect(stale.commitDetails).toBeUndefined();
        expect(stale.detailsLoading).toBe(true);
    });

    it('loads worktree details independently from commit selection', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectWorktree', path: '/repo/.worktrees/topic' });
        const stale = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/worktreeDetailsResponse',
                requestId: 'details-1',
                path: '/repo/.worktrees/other',
                head: 'other',
                branch: 'feature/other',
                files: [],
            },
        });
        const loaded = reduceGraphState(stale, {
            type: 'message',
            message: {
                type: 'graph/worktreeDetailsResponse',
                requestId: 'details-2',
                path: '/repo/.worktrees/topic',
                head: 'head',
                branch: 'feature/topic',
                files: [{ status: '?', filePath: 'src/new.ts' }],
            },
        });

        expect(selected.selectedHash).toBeUndefined();
        expect(selected.selectedWorktreePath).toBe('/repo/.worktrees/topic');
        expect(selected.detailsLoading).toBe(true);
        expect(stale.commitDetails).toBeUndefined();
        expect(loaded.commitDetails).toEqual({
            kind: 'worktree',
            hash: 'head',
            fullMessage: 'feature/topic',
            files: [{ status: '?', filePath: 'src/new.ts' }],
            path: '/repo/.worktrees/topic',
            branch: 'feature/topic',
        });
    });

    it('tracks multiple selected commits', () => {
        const first = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'a' });
        const added = reduceGraphState(first, { type: 'toggleCommitSelection', hash: 'b' });
        const removed = reduceGraphState(added, { type: 'toggleCommitSelection', hash: 'a' });

        expect(added.selectedHashes).toEqual(['a', 'b']);
        expect(added.selectedHash).toBe('b');
        expect(removed.selectedHashes).toEqual(['b']);
        expect(removed.selectedHash).toBe('b');
    });

    it('selects commit ranges without changing the anchor', () => {
        const anchored = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'a' });
        const ranged = reduceGraphState(anchored, { type: 'selectCommitRange', focusHash: 'd', hashes: ['a', 'b', 'c', 'd'] });

        expect(ranged.selectedHashes).toEqual(['a', 'b', 'c', 'd']);
        expect(ranged.selectedHash).toBe('d');
        expect(ranged.selectionAnchorHash).toBe('a');
    });

    it('clears graph errors', () => {
        const failed = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/error',
                requestId: graphRequestId(0, 'replace'),
                message: 'Graph failed',
                error: {
                    code: 'gitOperationFailed',
                    message: 'Graph failed',
                    operation: 'graph/dataRequest',
                    recoverable: true,
                },
            },
        });

        const cleared = reduceGraphState(failed, { type: 'clearError' });

        expect(failed.error?.message).toBe('Graph failed');
        expect(failed.activeGraphRequestId).toBeUndefined();
        expect(cleared.error).toBeUndefined();
    });

    it('keeps graph loading active for optional uncorrelated warnings', () => {
        const warned = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/error',
                message: 'Submodule branches unavailable',
                error: {
                    code: 'optionalDataUnavailable',
                    message: 'Submodule branches unavailable',
                    operation: 'graph/submoduleBranches',
                    recoverable: true,
                },
            },
        });

        expect(warned.loading).toBe(true);
        expect(warned.activeGraphRequestId).toBe(graphRequestId(0, 'replace'));
        expect(warned.error?.code).toBe('optionalDataUnavailable');
    });

    it('tracks graph operation feedback and clears only the active operation', () => {
        const running = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/operationStatus',
                operationId: 'op-1',
                status: GraphOperationStatus.Running,
                category: GraphOperationCategory.Repository,
                command: 'fetch',
            },
        });
        const staleSuccess = reduceGraphState(running, {
            type: 'message',
            message: {
                type: 'graph/operationStatus',
                operationId: 'op-stale',
                status: GraphOperationStatus.Success,
                category: GraphOperationCategory.Repository,
                command: 'fetch',
            },
        });
        const success = reduceGraphState(staleSuccess, {
            type: 'message',
            message: {
                type: 'graph/operationStatus',
                operationId: 'op-1',
                status: GraphOperationStatus.Success,
                category: GraphOperationCategory.Repository,
                command: 'fetch',
            },
        });
        const clearedWrong = reduceGraphState(success, { type: 'clearOperationStatus', operationId: 'op-stale' });
        const cleared = reduceGraphState(clearedWrong, { type: 'clearOperationStatus', operationId: 'op-1' });

        expect(running.operationStatus?.status).toBe(GraphOperationStatus.Running);
        expect(staleSuccess.operationStatus?.operationId).toBe('op-1');
        expect(success.operationStatus?.status).toBe(GraphOperationStatus.Success);
        expect(clearedWrong.operationStatus).toBeDefined();
        expect(cleared.operationStatus).toBeUndefined();
    });

    it('ignores graph operation feedback from another repository scope', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
        });
        const ignored = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/operationStatus',
                operationId: 'op-main',
                status: GraphOperationStatus.Running,
                category: GraphOperationCategory.Repository,
                command: 'fetch',
                repositoryScope: { kind: 'main' },
            },
        });

        expect(ignored.operationStatus).toBeUndefined();
    });

    it('ignores stale graph responses after a newer refresh response has completed', () => {
        const refreshing = reduceGraphState(createInitialGraphState(), { type: 'refreshRequested' });
        const fresh = reduceGraphState(refreshing, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('fresh')], 1, false),
                    branches: [branch('main')],
                    currentBranch: 'main',
                },
            },
        });
        const stale = reduceGraphState(fresh, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('stale')], 1, false),
                    branches: [branch('old')],
                    currentBranch: 'old',
                },
            },
        });

        expect(stale.branches).toEqual([branch('main')]);
        expect(stale.currentBranch).toBe('main');
        expect(stale.rows.map((row) => row.commit.hash)).toEqual(['fresh']);
    });

    it('ignores graph errors correlated to an older request', () => {
        const refreshing = reduceGraphState(createInitialGraphState(), { type: 'refreshRequested' });
        const staleError = reduceGraphState(refreshing, {
            type: 'message',
            message: {
                type: 'graph/error',
                requestId: graphRequestId(0, 'replace'),
                message: 'Old graph failed',
                error: {
                    code: 'gitOperationFailed',
                    message: 'Old graph failed',
                    operation: 'graph/dataRequest',
                    recoverable: true,
                },
            },
        });

        expect(staleError.loading).toBe(true);
        expect(staleError.activeGraphRequestId).toBe(graphRequestId(1, 'replace'));
        expect(staleError.error).toBeUndefined();
    });

    it('stores graph submodule summaries from graph data', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('a')], 1, false),
                    submodules: [{
                        path: 'modules/auth-kit',
                        name: 'auth-kit',
                        status: SubmoduleStatus.Dirty,
                        branches: [],
                        worktrees: [],
                    }],
                },
            },
        });

        expect(loaded.submodules).toEqual([{
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.Dirty,
            branches: [],
            worktrees: [],
        }]);
    });

    it('hydrates submodule summaries without recalculating graph rows', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('a')], 1, false),
                    submodules: [{
                        path: 'modules/auth-kit',
                        name: 'auth-kit',
                        status: SubmoduleStatus.Dirty,
                        branches: [],
                        worktrees: [],
                    }],
                },
            },
        });
        const hydrated = reduceGraphState(loaded, {
            type: 'message',
            message: {
                type: 'graph/submodulesPush',
                repoId: '/repo',
                repositoryScope: { kind: 'main' },
                submodules: [{
                    path: 'modules/auth-kit',
                    name: 'auth-kit',
                    status: SubmoduleStatus.Dirty,
                    branches: [branch('feature/oauth')],
                    worktrees: [],
                }],
            },
        });

        expect(hydrated.rows).toBe(loaded.rows);
        expect(hydrated.displayRows).toBe(loaded.displayRows);
        expect(hydrated.submodules[0]?.branches).toEqual([branch('feature/oauth')]);
    });

    it('preserves hydrated submodule summaries while loading more commits', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('b', ['a'])], 1, true),
                    submodules: [{
                        path: 'modules/auth-kit',
                        name: 'auth-kit',
                        status: SubmoduleStatus.Dirty,
                        branches: [branch('feature/oauth')],
                        worktrees: [],
                    }],
                },
            },
        });
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });
        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 1),
                data: {
                    ...graphData([commit('b', ['a']), commit('a')], 2, false),
                    submodules: [{
                        path: 'modules/auth-kit',
                        name: 'auth-kit',
                        status: SubmoduleStatus.Dirty,
                        branches: [],
                        worktrees: [],
                    }],
                },
            },
        });

        expect(next.submodules[0]?.branches).toEqual([branch('feature/oauth')]);
    });

    it('switches graph requests to an unfiltered submodule scope', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('parent-hash')], 1, false),
                    branches: [branch('main')],
                    submodules: [{
                        path: 'modules/auth-kit',
                        name: 'auth-kit',
                        status: SubmoduleStatus.Clean,
                        branches: [branch('feature/oauth')],
                        worktrees: [],
                    }],
                },
            },
        });
        const selected = reduceGraphState(
            reduceGraphState(loaded, { type: 'selectCommit', hash: 'parent-hash' }),
            {
                type: 'selectSubmodule',
                submodulePath: 'modules/auth-kit',
                submoduleLabel: 'auth-kit',
            },
        );

        expect(selected.repositoryScope).toEqual({
            kind: 'submodule',
            path: 'modules/auth-kit',
            label: 'auth-kit',
        });
        expect(selected.selectedBranchFilter).toBeUndefined();
        expect(selected.filters.branches).toBeUndefined();
        expect(selected.loading).toBe(true);
        expect(selected.selectedHash).toBeUndefined();
        expect(selected.commitDetails).toBeUndefined();
        expect(selected.rows).toEqual([]);
        expect(selected.branches).toEqual([]);
        expect(selected.submodules).toEqual([]);
    });

    it('returns from a submodule graph scope to the main repository', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
        });
        const main = reduceGraphState(scoped, { type: 'selectMainRepository' });

        expect(main.repositoryScope).toEqual({ kind: 'main' });
        expect(main.selectedBranchFilter).toBeUndefined();
        expect(main.filters.branches).toBeUndefined();
        expect(main.loading).toBe(true);
    });

    it('ignores stale graph responses for another repository scope', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
        });
        const loaded = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('submodule-head')], 1, false),
                    repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
                    branches: [branch('feature/oauth')],
                    currentBranch: 'feature/oauth',
                },
            },
        });
        const refreshing = reduceGraphState(loaded, { type: 'refreshRequested' });
        const stale = reduceGraphState(refreshing, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: 'old-main-request',
                data: {
                    ...graphData([], 0, false),
                    repositoryScope: { kind: 'main' },
                    branches: [],
                    currentBranch: 'main',
                },
            },
        });

        expect(stale.branches).toEqual([branch('feature/oauth')]);
        expect(stale.currentBranch).toBe('feature/oauth');
        expect(stale.repositoryScope).toEqual({ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' });
        expect(stale.loading).toBe(true);
    });

    it('does not replace submodule branch data with main repository data pushes', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
        });
        const loaded = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('submodule-head')], 1, false),
                    repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
                    branches: [branch('feature/oauth')],
                    currentBranch: 'feature/oauth',
                },
            },
        });
        const pushed = reduceGraphState(loaded, {
            type: 'message',
            message: {
                type: 'graph/dataPush',
                repoId: '/repo',
                data: {
                    ...graphData([], 0, false),
                    repositoryScope: { kind: 'main' },
                    branches: [],
                    currentBranch: 'main',
                },
            },
        });

        expect(pushed.branches).toEqual([branch('feature/oauth')]);
        expect(pushed.currentBranch).toBe('feature/oauth');
        expect(pushed.repositoryScope).toEqual({ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' });
        expect(pushed.loading).toBe(true);
        expect(pushed.refreshVersion).toBe(2);
    });

    it('keeps multiple worktree WIP rows that point at the same commit', () => {
        const rows = [row('head', laneData())];
        const displayRows = buildDisplayRows(rows, [
            wip('/repo/worktrees/a', 'head'),
            wip('/repo/worktrees/b', 'head'),
        ]);

        expect(displayRows.map((displayRow) => displayRow.kind)).toEqual(['wip', 'wip', 'commit']);
        expect(displayRows.filter((displayRow) => displayRow.kind === 'wip').map((displayRow) => displayRow.wip.path)).toEqual([
            '/repo/worktrees/a',
            '/repo/worktrees/b',
        ]);
    });

    it('uses synthetic lane lines for WIP rows and connects the real commit below them', () => {
        const parentLine = {
            fromLane: 1,
            toLane: 2,
            color: '#79b8ff',
            type: 'fork-right',
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        } satisfies LaneData['lines'][number];
        const displayRows = buildDisplayRows([row('head', laneData([parentLine]))], [wip('/repo/wt', 'head')]);
        const wipRow = displayRows[0];
        const commitRow = displayRows[1];

        expect(wipRow?.kind).toBe('wip');
        if (wipRow?.kind !== 'wip') { throw new Error('Expected WIP row.'); }
        expect(wipRow.laneData.lines).toEqual([expect.objectContaining({
            fromLane: 1,
            toLane: 1,
            type: 'straight',
            startY: 'center',
            endY: 'bottom',
        })]);

        expect(commitRow?.kind).toBe('commit');
        if (commitRow?.kind !== 'commit') { throw new Error('Expected commit row.'); }
        expect(commitRow.row.laneData.lines).toContainEqual(expect.objectContaining({
            fromLane: 1,
            toLane: 1,
            type: 'straight',
            startY: 'top',
            endY: 'center',
        }));
        expect(commitRow.row.laneData.lines).toContain(parentLine);
    });
});
