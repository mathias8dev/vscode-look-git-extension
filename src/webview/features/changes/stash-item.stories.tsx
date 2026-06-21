import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop, stashEntries, stashFiles } from '@webview/storybook-fixtures';
import { StashItem } from '@webview/features/changes/stash-item';

const meta = {
    title: 'Changes/StashItem',
    component: StashItem,
    args: {
        stash: stashEntries[0],
        expanded: true,
        files: stashFiles,
        onToggle: noop,
        onAction: noop,
        onFileDiff: noop,
    },
    argTypes: {
        onToggle: { control: false },
        onAction: { control: false },
        onFileDiff: { control: false },
    },
} satisfies Meta<typeof StashItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded = {} satisfies Story;

export const Collapsed = {
    args: {
        expanded: false,
    },
} satisfies Story;

export const LoadingFiles = {
    args: {
        files: undefined,
    },
} satisfies Story;
