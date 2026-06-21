import type { Meta, StoryObj } from '@storybook/react-vite';
import { historyCommit, noop } from '@webview/storybook-fixtures';
import { CommitHistoryRow } from '@webview/features/history/commit-history-row';

const meta = {
    title: 'History/CommitHistoryRow',
    component: CommitHistoryRow,
    args: {
        commit: historyCommit,
        expanded: false,
        selected: false,
        showSelectionCheckbox: false,
        childHash: undefined,
        parentHash: historyCommit.parentHashes[0],
        canUndoCommit: true,
        canCherryPick: true,
        hasMultipleSelectedCommits: false,
        onSelect: noop,
        onContextMenu: noop,
    },
    argTypes: {
        onSelect: { control: false },
        onContextMenu: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface history-list">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof CommitHistoryRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {} satisfies Story;

export const ExpandedSelected = {
    args: {
        expanded: true,
        selected: true,
        showSelectionCheckbox: true,
    },
} satisfies Story;
