import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop } from '../../storybookFixtures';
import { GraphEmptyState } from './GraphEmptyState';

const meta = {
    title: 'Graph/GraphEmptyState',
    component: GraphEmptyState,
    args: {
        title: 'No commits found',
        subtitle: 'Adjust the active filters or refresh the repository.',
    },
} satisfies Meta<typeof GraphEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoCommits = {} satisfies Story;

export const WithAction = {
    args: {
        actionLabel: 'Clear Filters',
        onAction: noop,
    },
} satisfies Story;
