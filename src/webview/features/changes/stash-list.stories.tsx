import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop, stashEntries, stashFiles } from '@webview/storybook-fixtures';
import { StashList } from '@webview/features/changes/stash-list';

const meta = {
    title: 'Changes/StashList',
    component: StashList,
    args: {
        stashes: stashEntries,
        expandedIndexes: [0],
        filesByIndex: { 0: stashFiles },
        onToggleStash: noop,
        onStashAction: noop,
        onStashFileDiff: noop,
    },
    argTypes: {
        onToggleStash: { control: false },
        onStashAction: { control: false },
        onStashFileDiff: { control: false },
    },
} satisfies Meta<typeof StashList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithExpandedStash = {} satisfies Story;

export const EmptyVisible = {
    args: {
        stashes: [],
        expandedIndexes: [],
        filesByIndex: {},
        showWhenEmpty: true,
    },
} satisfies Story;
