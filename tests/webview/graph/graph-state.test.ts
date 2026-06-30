import { describe, expect, it } from 'vitest';
import { GraphOperationCategory, GraphOperationStatus } from '@protocol/graph/messages';
import type { BranchInfo, GraphCommit, GraphData, WorktreeWip } from '@protocol/graph/types';
import { SubmoduleStatus, type RepositorySummary } from '@protocol/shared/repo';
import { buildDisplayRows, createInitialGraphState, graphRequestId, reduceGraphState } from '@webview/features/graph/graph-state';
import type { GraphRow, LaneData } from '@webview/features/graph/layout/graph-lane-model';
import { findAdjacentDisconnectedSameLaneIssues, findFloatingNodeIssues, findLaneContinuityIssues } from '@tests/helpers/graph-layout-assertions';

const mainRepository = { repoId: 'main-repo-id', kind: 'main', path: '/repo' } as const;
const authKitRepository = { repoId: 'auth-kit-id', kind: 'submodule', path: '/repo/modules/auth-kit', parentRepoId: 'main-repo-id' } as const;

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
        repository: mainRepository,
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
    it('stores repository navigator resources across repository context resets', () => {
        const repositories = [repositorySummary('repo-a')];
        const withRepositories = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'repo/repositoriesChanged',
                repositories: { status: 'ready', data: repositories },
                activeContextId: { status: 'ready', data: 'repo-a' },
                listContextId: { status: 'ready', data: undefined },
            },
        });

        const reset = reduceGraphState(withRepositories, {
            type: 'message',
            message: {
                type: 'repo/contextChanged',
                context: { id: 'repo-a', cwd: '/work/repo-a', kind: 'main', label: 'repo-a' },
            },
        });

        expect(reset.repositorySummaries).toEqual({ status: 'ready', data: repositories });
        expect(reset.activeRepositoryContextId).toEqual({ status: 'ready', data: 'repo-a' });
    });

    it('optimistically opens repository detail without sending graph requests before context confirmation', () => {
        const repositories = [repositorySummary('repo-a'), repositorySummary('repo-b')];
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('a', [])], 1, false),
            },
        });
        const withNavigator = reduceGraphState(loaded, {
            type: 'message',
            message: {
                type: 'repo/repositoriesChanged',
                repositories: { status: 'ready', data: repositories },
                activeContextId: { status: 'ready', data: undefined },
                listContextId: { status: 'ready', data: undefined },
            },
        });

        const selected = reduceGraphState(withNavigator, { type: 'selectRepositoryContext', contextId: 'repo-b' });
        const confirmed = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'repo/contextChanged',
                context: { id: 'repo-b', cwd: '/work/repo-b', kind: 'main', label: 'repo-b' },
            },
        });
        const back = reduceGraphState(selected, { type: 'showRepositoryList' });

        expect(selected.activeRepositoryContextId).toEqual({ status: 'ready', data: 'repo-b' });
        expect(selected.rows).toEqual([]);
        expect(selected.loading).toBe(true);
        expect(selected.activeGraphRequestId).toBeUndefined();
        expect(confirmed.activeGraphRequestId).toBe(graphRequestId(0, 'replace'));
        expect(back.activeRepositoryContextId).toEqual({ status: 'ready', data: undefined });
    });

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
                data: graphData([commit('a')], 2, false),
            },
        });

        expect(next.loadingMore).toBe(false);
        expect(next.loadedCount).toBe(2);
        expect(next.rows).toHaveLength(2);
        expect(next.hasMore).toBe(false);
    });

    it('deduplicates overlapping load-more commits while appending new page data', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('c', ['b']), commit('b', ['a'])], 2, true),
            },
        });
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });
        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 2),
                data: graphData([commit('b', ['a']), commit('a')], 4, false),
            },
        });

        expect(next.rows.map((row) => row.commit.hash)).toEqual(['c', 'b', 'a']);
        expect(next.loadedCount).toBe(4);
    });

    it('uses expanded prefix load-more responses as the ordered graph source', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('c', ['b']), commit('b', ['a'])], 2, true),
            },
        });
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });
        const refreshedCommit = {
            ...commit('c', ['b']),
            message: 'refreshed c',
        } satisfies GraphCommit;

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 2),
                data: graphData([refreshedCommit, commit('b', ['a']), commit('a')], 3, false),
            },
        });

        expect(next.rows.map((row) => row.commit.hash)).toEqual(['c', 'b', 'a']);
        expect(next.rows[0]?.commit.message).toBe('refreshed c');
        expect(next.loadedCount).toBe(3);
    });

    it('keeps expanded prefix order when new commits appear above the loaded window', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('b', ['a']), commit('a')], 2, true),
            },
        });
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 2),
                data: graphData([commit('c', ['b']), commit('b', ['a']), commit('a'), commit('root')], 4, false),
            },
        });

        expect(next.rows.map((row) => row.commit.hash)).toEqual(['c', 'b', 'a', 'root']);
        expect(next.loadedCount).toBe(4);
    });

    it('keeps already-loaded lanes stable when load more reveals an older parent', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([
                    commit('topic-tip', ['base']),
                    commit('main-tip', ['base']),
                ], 2, true),
            },
        });
        const lanesBefore = new Map(loaded.rows.map((graphRow) => [graphRow.commit.hash, graphRow.laneData.lane]));
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 2),
                data: graphData([
                    commit('topic-tip', ['base']),
                    commit('main-tip', ['base']),
                    commit('base'),
                ], 3, false),
            },
        });

        for (const [hash, lane] of lanesBefore) {
            expect(next.rows.find((graphRow) => graphRow.commit.hash === hash)?.laneData.lane).toBe(lane);
        }
        expect(findFloatingNodeIssues(next.rows)).toEqual([]);
        expect(findLaneContinuityIssues(next.rows)).toEqual([]);
    });

    it('keeps page-boundary merge rows connected when load more reveals hidden parents', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([
                    commit('merge', ['main', 'feature']),
                    commit('main', ['base']),
                ], 2, true),
            },
        });
        const loadingMore = reduceGraphState(loaded, { type: 'startLoadMore' });

        const next = reduceGraphState(loadingMore, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'more', 2),
                data: graphData([
                    commit('merge', ['main', 'feature']),
                    commit('main', ['base']),
                    commit('feature', ['base']),
                    commit('base'),
                ], 4, false),
            },
        });

        expect(next.rows.map((graphRow) => graphRow.commit.hash)).toEqual(['merge', 'main', 'feature', 'base']);
        expect(findFloatingNodeIssues(next.rows)).toEqual([]);
        expect(findLaneContinuityIssues(next.rows)).toEqual([]);
        expect(findAdjacentDisconnectedSameLaneIssues(next.rows)).toEqual([]);
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

    it('keeps graph row identity when refreshed graph data is unchanged', () => {
        const data = {
            ...graphData([commit('b', ['a']), commit('a')], 2, false),
            branches: [branch('main')],
        };
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data,
            },
        });
        const refreshing = reduceGraphState(loaded, { type: 'refreshRequested' });
        const refreshed = reduceGraphState(refreshing, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data,
            },
        });

        expect(refreshed.loading).toBe(false);
        expect(refreshed.activeGraphRequestId).toBeUndefined();
        expect(refreshed.rows).toBe(loaded.rows);
        expect(refreshed.layoutState).toBe(loaded.layoutState);
        expect(refreshed.displayRows).toBe(loaded.displayRows);
        expect(refreshed.branches).toBe(loaded.branches);
    });

    it('uses the current branch hash to mark the primary spine when refs are missing', () => {
        const head = commit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', ['base']);
        const state = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['base']), head, commit('base')], 3, false),
                    branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: head.hash }],
                },
            },
        });

        expect(state.rows.find((graphRow) => graphRow.commit.hash === head.hash)?.laneData.isPrimary).toBe(true);
    });

    it('renders hidden first-parent boundary lines while more graph history is available', () => {
        const state = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('visible-child', ['hidden-parent'])], 1, true),
            },
        });

        const boundaryLine = state.rows[0]?.laneData.lines.find((line) => line.role === 'first-parent');

        expect(boundaryLine).toEqual(expect.objectContaining({
            role: 'first-parent',
            startY: 'center',
            endY: 'bottom',
        }));
        expect(boundaryLine).not.toHaveProperty('targetHash');
    });

    it('keeps sparse search-filtered commits from reusing disconnected lanes', () => {
        const filtered = reduceGraphState(createInitialGraphState(), { type: 'setFilters', filters: { search: 'needle' } });
        const state = reduceGraphState(filtered, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: graphData([
                    commit('needle-newer', ['hidden-parent']),
                    commit('needle-older', ['older-hidden-parent']),
                ], 2, false),
            },
        });

        expect(findAdjacentDisconnectedSameLaneIssues(state.rows)).toEqual([]);
        expect(findLaneContinuityIssues(state.rows)).toEqual([]);
    });

    it('clears graph filters and reloads data', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([], 0, false),
            },
        });
        const filtered = reduceGraphState(loaded, { type: 'setBranchFilter', branch: 'feature/login' });
        const cleared = reduceGraphState(filtered, { type: 'clearFilters' });

        expect(cleared.filters).toEqual({});
        expect(cleared.selectedBranchFilter).toBeUndefined();
        expect(cleared.loading).toBe(true);
        expect(cleared.activeGraphRequestId).toBe(graphRequestId(2, 'replace'));
    });

    it('clears the selected branch filter when that branch is invalidated (deleted or renamed)', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('a')], 1, false),
            },
        });
        const filtered = reduceGraphState(loaded, { type: 'setBranchFilter', branch: 'feature/login' });
        const invalidated = reduceGraphState(filtered, {
            type: 'message',
            message: {
                type: 'graph/branchFilterInvalidated',
                branch: 'feature/login',
            },
        });

        expect(invalidated.selectedBranchFilter).toBeUndefined();
        expect(invalidated.filters.branches).toBeUndefined();
        expect(invalidated.loading).toBe(true);
        expect(invalidated.activeGraphRequestId).toBe(graphRequestId(2, 'replace'));
    });

    it('keeps a different branch filter when another branch is invalidated', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('a')], 1, false),
            },
        });
        const filtered = reduceGraphState(loaded, { type: 'setBranchFilter', branch: 'feature/login' });
        const invalidated = reduceGraphState(filtered, {
            type: 'message',
            message: {
                type: 'graph/branchFilterInvalidated',
                branch: 'feature/other',
            },
        });

        expect(invalidated.selectedBranchFilter).toBe('feature/login');
        expect(invalidated.filters.branches).toEqual(['feature/login']);
        expect(invalidated.loading).toBe(true);
        expect(invalidated.activeGraphRequestId).toBe(graphRequestId(2, 'replace'));
    });

    it('ignores a branch-filter invalidation for a different repository', () => {
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: graphData([commit('a')], 1, false),
            },
        });
        const filtered = reduceGraphState(loaded, { type: 'setBranchFilter', branch: 'feature/login' });
        const ignored = reduceGraphState(filtered, {
            type: 'message',
            message: {
                type: 'graph/branchFilterInvalidated',
                branch: 'feature/login',
                repository: authKitRepository,
            },
        });

        // Mismatched repository: the filter must be left intact and no reload triggered.
        expect(ignored).toBe(filtered);
        expect(ignored.selectedBranchFilter).toBe('feature/login');
        expect(ignored.activeGraphRequestId).toBe(graphRequestId(1, 'replace'));
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

    it('clears detailsLoading when a worktree details request fails', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectWorktree', path: '/repo/.worktrees/new-wt' });
        expect(selected.detailsLoading).toBe(true);

        const errored = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/error',
                requestId: 'graph-req-1',
                message: 'No runtime worktree available.',
                error: {
                    code: 'gitOperationFailed',
                    message: 'No runtime worktree available.',
                    operation: 'graph/worktreeDetailsRequest',
                    recoverable: true,
                },
            },
        });

        expect(errored.detailsLoading).toBe(false);
        expect(errored.error?.message).toBe('No runtime worktree available.');
        expect(errored.loading).toBe(true);
        expect(errored.activeGraphRequestId).toBe(graphRequestId(0, 'replace'));
    });

    it('clears detailsLoading when a commit details request fails', () => {
        const selected = reduceGraphState(createInitialGraphState(), { type: 'selectCommit', hash: 'abc123' });
        expect(selected.detailsLoading).toBe(true);

        const errored = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/error',
                requestId: 'graph-req-2',
                message: 'No runtime repository available.',
                error: {
                    code: 'gitOperationFailed',
                    message: 'No runtime repository available.',
                    operation: 'graph/commitDetailsRequest',
                    recoverable: true,
                },
            },
        });

        expect(errored.detailsLoading).toBe(false);
        expect(errored.error?.message).toBe('No runtime repository available.');
        expect(errored.loading).toBe(true);
        expect(errored.activeGraphRequestId).toBe(graphRequestId(0, 'replace'));
    });

    it('does not clear detailsLoading for a stale graph error that happens while details are loading', () => {
        const initial = createInitialGraphState();
        const reloaded = reduceGraphState(initial, { type: 'refreshRequested' });
        const staleGraphRequestId = initial.activeGraphRequestId!;

        const selected = reduceGraphState(reloaded, { type: 'selectCommit', hash: 'abc123' });
        expect(selected.detailsLoading).toBe(true);

        const errored = reduceGraphState(selected, {
            type: 'message',
            message: {
                type: 'graph/error',
                requestId: staleGraphRequestId,
                message: 'Stale graph error',
                error: {
                    code: 'gitOperationFailed',
                    message: 'Stale graph error',
                    operation: 'graph/dataRequest',
                    recoverable: true,
                },
            },
        });

        expect(errored.detailsLoading).toBe(true);
        expect(errored.error).toBeUndefined();
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

    it('ignores graph operation feedback from another repository', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
            repository: authKitRepository,
        });
        const ignored = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/operationStatus',
                operationId: 'op-main',
                status: GraphOperationStatus.Running,
                category: GraphOperationCategory.Repository,
                command: 'fetch',
                repository: mainRepository,
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
                repository: mainRepository,
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

    it('preserves hydrated submodule summaries when refreshed graph data only includes summaries', () => {
        const summarySubmodule = {
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.Dirty,
            branches: [],
            worktrees: [],
        };
        const loaded = reduceGraphState(createInitialGraphState(), {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(0, 'replace'),
                data: {
                    ...graphData([commit('a')], 1, false),
                    submodules: [summarySubmodule],
                },
            },
        });
        const hydrated = reduceGraphState(loaded, {
            type: 'message',
            message: {
                type: 'graph/submodulesPush',
                repoId: '/repo',
                repository: mainRepository,
                submodules: [{
                    ...summarySubmodule,
                    branches: [branch('feature/oauth')],
                    worktrees: [],
                }],
            },
        });
        const refreshing = reduceGraphState(hydrated, { type: 'refreshRequested' });
        const refreshed = reduceGraphState(refreshing, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('a')], 1, false),
                    submodules: [summarySubmodule],
                },
            },
        });

        expect(refreshed.rows).toBe(hydrated.rows);
        expect(refreshed.displayRows).toBe(hydrated.displayRows);
        expect(refreshed.submodules).toBe(hydrated.submodules);
        expect(refreshed.submodules[0]?.branches).toEqual([branch('feature/oauth')]);
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
                    ...graphData([commit('a')], 2, false),
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
                        repository: authKitRepository,
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
                repository: authKitRepository,
            },
        );

        expect(selected.selectedRepository).toEqual({
            kind: 'submodule',
            path: 'modules/auth-kit',
            label: 'auth-kit',
        });
        expect(selected.repository).toEqual(authKitRepository);
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
            repository: authKitRepository,
        });
        const main = reduceGraphState(scoped, { type: 'selectMainRepository' });

        expect(main.selectedRepository).toEqual({ kind: 'main' });
        expect(main.selectedBranchFilter).toBeUndefined();
        expect(main.filters.branches).toBeUndefined();
        expect(main.loading).toBe(true);
    });

    it('ignores stale graph responses for another repository', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
            repository: authKitRepository,
        });
        const loaded = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('submodule-head')], 1, false),
                    repository: authKitRepository,
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
                    repository: mainRepository,
                    branches: [],
                    currentBranch: 'main',
                },
            },
        });

        expect(stale.branches).toEqual([branch('feature/oauth')]);
        expect(stale.currentBranch).toBe('feature/oauth');
        expect(stale.selectedRepository).toEqual({ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' });
        expect(stale.loading).toBe(true);
    });

    it('does not replace submodule branch data with main repository data pushes', () => {
        const scoped = reduceGraphState(createInitialGraphState(), {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
            repository: authKitRepository,
        });
        const loaded = reduceGraphState(scoped, {
            type: 'message',
            message: {
                type: 'graph/dataResponse',
                requestId: graphRequestId(1, 'replace'),
                data: {
                    ...graphData([commit('submodule-head')], 1, false),
                    repository: authKitRepository,
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
                    repository: mainRepository,
                    branches: [],
                    currentBranch: 'main',
                },
            },
        });

        expect(pushed.branches).toEqual([branch('feature/oauth')]);
        expect(pushed.currentBranch).toBe('feature/oauth');
        expect(pushed.selectedRepository).toEqual({ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' });
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

function repositorySummary(id: string): RepositorySummary {
    return {
        context: { id, cwd: `/work/${id}`, kind: 'main', label: id },
        branch: 'main',
        upstream: 'origin/main',
        hasRemote: true,
        branchCount: 2,
        submoduleCount: 0,
        worktreeCount: 1,
        stagedCount: 0,
        unstagedCount: 0,
        conflictCount: 0,
    };
}
