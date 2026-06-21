import { ConflictState, type StatusEntry, type StashEntry, type StashFileEntry, type SubmoduleEntry, type SubmoduleStatusData } from '@protocol/changes/types';
import type { BranchInfo, CommitFileChange, GraphCommit, GraphSubmoduleInfo, WorktreeInfo, WorktreeWip } from '@protocol/graph/types';
import type { HistoryCommit, HistoryCommitDetails, HistoryCommitFile } from '@protocol/history/types';
import { OperationNoticeActionKind, OperationStatus } from '@protocol/shared/operation';
import { SubmoduleStatus } from '@protocol/shared/repo';
import { GraphOperationCategory, type GraphOperationStatusPush } from '@protocol/graph/messages';
import type { CommitDetails } from '@webview/features/graph/graph-state';
import type { GraphRow } from '@webview/features/graph/layout/graph-lane-model';
import { ChangeSectionId, type ChangeListItem } from '@webview/features/changes/change-tree';

export const noop = () => undefined;

export const changedFiles = [
    statusEntry(' M', 'src/webview/features/changes/CommitComposer.tsx'),
    statusEntry(' M', 'src/webview/features/graph/GraphRow.tsx'),
    statusEntry('A ', 'src/webview/shared/storybookFixtures.ts'),
    statusEntry('R ', 'src/webview/shared/fileIconModel.ts', 'src/webview/features/changes/fileIconModel.ts'),
    statusEntry('??', 'ios/Info.plist'),
] as const;

export const conflictFiles = [
    statusEntry('UU', 'src/webview/features/graph/GraphTable.tsx'),
    statusEntry('AA', 'src/webview/features/changes/ChangeRow.tsx'),
] as const;

export const stagedFiles = [
    statusEntry('M ', 'README.md'),
    statusEntry('A ', 'android/build.gradle'),
] as const;

export const stashEntries = [
    { index: 0, message: 'WIP on feature/storybook: add visual fixtures' },
    { index: 1, message: 'graph branch panel cleanup' },
] as const satisfies readonly StashEntry[];

export const stashFiles = [
    { status: 'M', filePath: 'src/webview/features/changes/StashItem.tsx' },
    { status: 'A', filePath: 'docs/storybook.md' },
    { status: 'R', filePath: 'src/webview/shared/fileIconAssets.ts', origPath: 'src/webview/features/changes/fileIconAssets.ts' },
] as const satisfies readonly StashFileEntry[];

export const submodules = [
    { path: 'vendor/ui-kit', name: 'ui-kit', status: SubmoduleStatus.Dirty },
    { path: 'vendor/git-fixtures', name: 'git-fixtures', status: SubmoduleStatus.OutOfSync },
    { path: 'vendor/not-ready', name: 'not-ready', status: SubmoduleStatus.NotInitialized },
] as const satisfies readonly SubmoduleEntry[];

export const submoduleStatusData = {
    currentBranch: 'feature/storybook',
    staged: stagedFiles,
    unstaged: changedFiles.slice(0, 3),
    conflicts: conflictFiles.slice(0, 1),
    conflictState: ConflictState.Rebase,
    stashes: stashEntries,
} satisfies SubmoduleStatusData;

export const branches = [
    branch('main', false, false, 'aaaaaaa', undefined, 0, 2),
    branch('feature/storybook', false, true, 'bbbbbbb', 'origin/feature/storybook', 3, 1),
    branch('feature/rebase-panel', false, false, 'ccccccc'),
    branch('origin/main', true, false, 'aaaaaaa'),
    branch('origin/feature/storybook', true, false, 'bbbbbbb'),
] as const satisfies readonly BranchInfo[];

export const worktrees = [
    { path: '/workspace/look-git', head: 'bbbbbbb', branch: 'refs/heads/feature/storybook', isMain: true, isDetached: false, isLocked: false },
    { path: '/workspace/look-git-review', head: 'ccccccc', branch: 'refs/heads/feature/rebase-panel', isMain: false, isDetached: false, isLocked: true, lockReason: 'reviewing visual rebase' },
] as const satisfies readonly WorktreeInfo[];

export const graphSubmodules = [
    {
        path: 'vendor/ui-kit',
        name: 'ui-kit',
        status: SubmoduleStatus.Dirty,
        branches: [branch('main', false, true, '1111111'), branch('origin/main', true, false, '1111111')],
        worktrees: [],
    },
    {
        path: 'vendor/git-fixtures',
        name: 'git-fixtures',
        status: SubmoduleStatus.OutOfSync,
        branches: [branch('main', false, true, '2222222')],
        worktrees: worktrees.slice(1),
    },
] satisfies readonly GraphSubmoduleInfo[];

export const commitFiles = [
    { status: 'M', filePath: 'src/webview/features/changes/CommitComposer.tsx' },
    { status: 'A', filePath: 'src/webview/features/graph/GraphRow.stories.tsx' },
    { status: 'R', filePath: 'src/webview/shared/fileIconAssets.ts', origPath: 'src/webview/features/changes/fileIconAssets.ts' },
    { status: 'D', filePath: 'docs/old-icons.md' },
    { status: 'M', filePath: 'vendor/ui-kit' },
] as const satisfies readonly CommitFileChange[];

export const commitDetails = {
    kind: 'commit',
    hash: 'bbbbbbb222222222222222222222222222222222',
    fullMessage: 'feat(webview): add Storybook component previews\n\nCovers shared controls, changes rows, graph rows, and history details.',
    files: commitFiles,
} satisfies CommitDetails;

export const graphCommits = [
    graphCommit('bbbbbbb222222222222222222222222222222222', 'feat(webview): add Storybook component previews', ['HEAD -> feature/storybook', 'origin/feature/storybook'], ['aaaaaaa111111111111111111111111111111111']),
    graphCommit('aaaaaaa111111111111111111111111111111111', 'fix(graph): make reset command context safe', ['main', 'origin/main'], []),
] as const satisfies readonly GraphCommit[];

export const graphRows = [
    {
        commit: graphCommits[0],
        laneData: {
            lane: 0,
            color: '#4ec9b0',
            isPrimary: true,
            lines: [
                { fromLane: 0, toLane: 0, color: '#4ec9b0', type: 'straight', role: 'first-parent', startY: 'center', endY: 'bottom' },
            ],
        },
    },
    {
        commit: {
            ...graphCommits[1],
            parentHashes: ['ddddddd333333333333333333333333333333333', 'eeeeeee444444444444444444444444444444444'],
        },
        laneData: {
            lane: 0,
            color: '#4ec9b0',
            isPrimary: true,
            lines: [
                { fromLane: 0, toLane: 0, color: '#4ec9b0', type: 'straight', role: 'first-parent', startY: 'top', endY: 'center' },
                { fromLane: 1, toLane: 0, color: '#c586c0', type: 'merge-left', role: 'merge-parent', startY: 'top', endY: 'center' },
            ],
        },
    },
] as const satisfies readonly GraphRow[];

export const worktreeWip = {
    path: '/workspace/look-git',
    head: graphCommits[0].hash,
    branch: 'feature/storybook',
    staged: 2,
    unstaged: 5,
    untracked: 1,
    conflicts: 1,
} satisfies WorktreeWip;

export const graphOperation = {
    type: 'graph/operationStatus',
    operationId: 'storybook-operation',
    status: OperationStatus.Conflict,
    category: GraphOperationCategory.Commit,
    command: 'rebaseOnto',
    target: 'bbbbbbb',
    actions: [OperationNoticeActionKind.ShowOutput],
} satisfies GraphOperationStatusPush;

export const historyCommit = {
    hash: graphCommits[0].hash,
    shortHash: graphCommits[0].shortHash,
    message: graphCommits[0].message,
    authorName: graphCommits[0].authorName,
    authorDate: graphCommits[0].authorDate,
    parentHashes: graphCommits[0].parentHashes,
    refs: [
        { name: 'feature/storybook', kind: 'local', isCurrent: true },
        { name: 'origin/feature/storybook', kind: 'remote' },
        { name: 'v1.1.0', kind: 'tag' },
    ],
    canCherryPick: true,
} satisfies HistoryCommit;

export const historyFiles = [
    { status: 'M', filePath: 'src/webview/features/changes/CommitComposer.tsx' },
    { status: 'A', filePath: 'src/webview/shared/storybookFixtures.ts' },
    { status: 'R', filePath: 'src/webview/shared/fileIconModel.ts', origPath: 'src/webview/features/changes/fileIconModel.ts' },
    { status: 'M', filePath: 'vendor/ui-kit', isSubmodule: true },
] as const satisfies readonly HistoryCommitFile[];

export const historyDetails = {
    hash: historyCommit.hash,
    fullMessage: commitDetails.fullMessage,
    files: historyFiles,
} satisfies HistoryCommitDetails;

export function changeItem(section: ChangeSectionId, entry: StatusEntry): ChangeListItem {
    return {
        id: `${section}:${entry.filePath}:${entry.origPath ?? ''}`,
        section,
        entry,
        isStaged: section === ChangeSectionId.Staged,
    };
}

export function statusEntry(status: string, filePath: string, origPath?: string): StatusEntry {
    return {
        indexStatus: status[0] ?? ' ',
        workTreeStatus: status[1] ?? ' ',
        filePath,
        origPath,
    };
}

function branch(name: string, isRemote: boolean, isCurrent: boolean, hash: string, upstream?: string, ahead?: number, behind?: number): BranchInfo {
    return {
        name,
        isRemote,
        isCurrent,
        hash,
        upstream,
        ahead,
        behind,
    };
}

function graphCommit(hash: string, message: string, refs: readonly string[], parentHashes: readonly string[]): GraphCommit {
    return {
        hash,
        shortHash: hash.slice(0, 7),
        message,
        authorName: 'Mathias',
        authorEmail: 'mathias@example.com',
        authorDate: '2026-06-17T00:00:00.000Z',
        parentHashes,
        refs,
        canCherryPick: true,
    };
}
