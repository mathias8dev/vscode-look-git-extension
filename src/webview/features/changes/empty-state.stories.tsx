import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop } from '@webview/storybook-fixtures';
import { EmptyState } from '@webview/features/changes/empty-state';

const meta = {
    title: 'Changes/EmptyState',
    component: EmptyState,
    args: {
        title: 'No changes',
        subtitle: 'Working tree is clean',
        icon: 'pass',
    },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Clean = {} satisfies Story;

export const Loading = {
    args: {
        title: 'Loading',
        subtitle: 'Reading repository state...',
        icon: 'loading',
        iconSpin: true,
    },
} satisfies Story;

export const WithAction = {
    args: {
        title: 'No repository',
        subtitle: 'Open a Git repository to see changes',
        icon: 'source-control',
        actionLabel: 'Open Folder',
        onAction: noop,
    },
} satisfies Story;
