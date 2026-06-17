import type { Meta, StoryObj } from '@storybook/react-vite';
import { branches, graphRows, noop } from '../../storybookFixtures';
import { GraphCommitRow } from './GraphRow';

const meta = {
    title: 'Graph/GraphCommitRow',
    component: GraphCommitRow,
    args: {
        row: graphRows[0],
        branches,
        selected: false,
        childHash: undefined,
        parentHash: graphRows[0].commit.parentHashes[0],
        canUndoCommit: true,
        canCherryPick: true,
        hasMultipleSelectedCommits: false,
        rowHeight: 28,
        style: { height: 28 },
        onSelect: noop,
        onOpenContextMenu: noop,
        onBranchDoubleClick: noop,
        onMoveFocus: noop,
    },
    argTypes: {
        style: { control: false },
        onSelect: { control: false },
        onOpenContextMenu: { control: false },
        onBranchDoubleClick: { control: false },
        onMoveFocus: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface graph-table">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof GraphCommitRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HeadCommit = {} satisfies Story;

export const Selected = {
    args: {
        selected: true,
    },
} satisfies Story;

export const MergeCommit = {
    args: {
        row: graphRows[1],
        canUndoCommit: false,
        hasMultipleSelectedCommits: true,
    },
} satisfies Story;
