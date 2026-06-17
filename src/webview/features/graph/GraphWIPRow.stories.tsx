import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphRows, noop, worktreeWip } from '../../storybookFixtures';
import { GraphWIPRow } from './GraphWIPRow';

const meta = {
    title: 'Graph/GraphWIPRow',
    component: GraphWIPRow,
    args: {
        wip: worktreeWip,
        laneData: graphRows[0].laneData,
        style: { height: 28 },
        rowHeight: 28,
        selected: false,
        onSelect: noop,
    },
    argTypes: {
        style: { control: false },
        onSelect: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface graph-table">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof GraphWIPRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DirtyWorktree = {} satisfies Story;

export const Selected = {
    args: {
        selected: true,
    },
} satisfies Story;
