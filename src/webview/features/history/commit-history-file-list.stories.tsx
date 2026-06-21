import type { Meta, StoryObj } from '@storybook/react-vite';
import { historyDetails, noop } from '@webview/storybook-fixtures';
import { CommitHistoryFileList } from '@webview/features/history/commit-history-file-list';

const meta = {
    title: 'History/CommitHistoryFileList',
    component: CommitHistoryFileList,
    args: {
        details: historyDetails,
        viewMode: 'tree',
        loading: false,
        onOpenDiff: noop,
        onFileContextMenu: noop,
    },
    argTypes: {
        onOpenDiff: { control: false },
        onFileContextMenu: { control: false },
    },
} satisfies Meta<typeof CommitHistoryFileList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tree = {} satisfies Story;

export const List = {
    args: {
        viewMode: 'list',
    },
} satisfies Story;

export const Loading = {
    args: {
        details: undefined,
        loading: true,
    },
} satisfies Story;
