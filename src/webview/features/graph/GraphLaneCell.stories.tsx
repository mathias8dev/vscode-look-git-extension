import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphRows } from '../../storybookFixtures';
import { GraphLaneCell } from './GraphLaneCell';

const meta = {
    title: 'Graph/GraphLaneCell',
    component: GraphLaneCell,
    args: {
        laneData: graphRows[0].laneData,
    },
} satisfies Meta<typeof GraphLaneCell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CommitDot = {} satisfies Story;

export const MergeDot = {
    args: {
        laneData: graphRows[1].laneData,
        merge: true,
    },
} satisfies Story;

export const WorktreeWip = {
    args: {
        laneData: graphRows[0].laneData,
        wip: true,
    },
} satisfies Story;
