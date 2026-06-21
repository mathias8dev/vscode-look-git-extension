import type { Meta, StoryObj } from '@storybook/react-vite';
import { commitFiles, noop } from '@webview/storybookFixtures';
import { ViewMode } from '@webview/shared/viewMode';
import { CommitFileTree } from '@webview/features/graph/CommitFileTree';

const meta = {
    title: 'Graph/CommitFileTree',
    component: CommitFileTree,
    args: {
        files: commitFiles,
        onDiff: noop,
        viewMode: ViewMode.Tree,
    },
    argTypes: {
        onDiff: { control: false },
    },
} satisfies Meta<typeof CommitFileTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tree = {} satisfies Story;

export const List = {
    args: {
        viewMode: ViewMode.List,
    },
} satisfies Story;

export const ReadOnly = {
    args: {
        diffable: false,
    },
} satisfies Story;
