import type { Meta, StoryObj } from '@storybook/react-vite';
import type { HistoryCommit } from '@protocol/history/types';
import { OperationNoticeActionKind, OperationStatus } from '@protocol/shared/operation';
import { historyCommit, historyDetails, noop } from '@webview/storybook-fixtures';
import { CommitHistoryApp } from '@webview/features/history/commit-history-app';
import { createInitialHistoryState, HistoryCommitSelectionMode, type HistoryState } from '@webview/features/history/history-state';

const secondCommit = {
    ...historyCommit,
    hash: 'aaaaaaa111111111111111111111111111111111',
    shortHash: 'aaaaaaa',
    message: 'fix(graph): make reset command context safe',
    parentHashes: [],
    refs: [{ name: 'main', kind: 'local', isCurrent: false }],
    canCherryPick: true,
} satisfies HistoryCommit;

const expandedState = {
    ...createInitialHistoryState(),
    loading: false,
    commits: [historyCommit, secondCommit],
    expandedHashes: [historyCommit.hash],
    selectedHashes: [historyCommit.hash, secondCommit.hash],
    selectionAnchorHash: historyCommit.hash,
    detailsByHash: { [historyCommit.hash]: historyDetails },
    hasMore: true,
    loadedCount: 2,
    operationStatus: {
        type: 'history/operationStatus',
        operationId: 'storybook-history-operation',
        status: OperationStatus.Failed,
        command: 'pull',
        actions: [OperationNoticeActionKind.ShowOutput],
    },
} satisfies HistoryState;

const meta = {
    title: 'History/Scenarios',
    component: CommitHistoryApp,
    args: appArgs(expandedState, ''),
    argTypes: {
        state: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-app-frame">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof CommitHistoryApp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ExpandedCommit = {} satisfies Story;

export const TreeFileView = {
    args: {
        ...appArgs(expandedState, ''),
        fileViewMode: 'tree',
    },
} satisfies Story;

export const SearchNoMatches = {
    args: appArgs(expandedState, 'no-matches'),
} satisfies Story;

export const Loading = {
    args: appArgs(createInitialHistoryState(), ''),
} satisfies Story;

function appArgs(state: HistoryState, query: string) {
    return {
        state,
        query,
        fileViewMode: 'list' as const,
        onQueryChange: noop,
        onToggleCommit: noop,
        onSelectCommit: (_hash: string, _mode: HistoryCommitSelectionMode, _visibleHashes: readonly string[]) => undefined,
        onOpenFileDiff: noop,
        onContextTarget: noop,
        onLoadMore: noop,
        onCopyHash: noop,
        onShowOperationOutput: noop,
        onDismissOperation: noop,
        onRepositoryNavigate: noop,
        onRepositoryBack: noop,
        onOpenRepositoryInNewWindow: noop,
    };
}
