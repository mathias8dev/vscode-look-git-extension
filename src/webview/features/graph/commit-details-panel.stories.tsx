import type { Meta, StoryObj } from '@storybook/react-vite';
import { commitDetails, noop } from '@webview/storybook-fixtures';
import { CommitDetailsPanel } from '@webview/features/graph/commit-details-panel';

const meta = {
    title: 'Graph/CommitDetailsPanel',
    component: CommitDetailsPanel,
    args: {
        details: commitDetails,
        loading: false,
        onClose: noop,
        onDiff: noop,
    },
    argTypes: {
        onClose: { control: false },
        onDiff: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface" style={{ height: '30em' }}>
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof CommitDetailsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loaded = {} satisfies Story;

export const Loading = {
    args: {
        details: undefined,
        loading: true,
    },
} satisfies Story;

export const Empty = {
    args: {
        details: undefined,
    },
} satisfies Story;
