import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop, stashFiles } from '@webview/storybook-fixtures';
import { StashFileRow } from '@webview/features/changes/stash-file-row';

const meta = {
    title: 'Changes/StashFileRow',
    component: StashFileRow,
    args: {
        index: 0,
        file: stashFiles[0],
        onDiff: noop,
    },
    argTypes: {
        onDiff: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface change-list">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof StashFileRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Modified = {} satisfies Story;

export const Renamed = {
    args: {
        file: stashFiles[2],
    },
} satisfies Story;
