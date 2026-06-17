import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from './IconButton';

const noop = () => undefined;

const meta = {
    title: 'Shared/IconButton',
    component: IconButton,
    args: {
        icon: 'refresh',
        title: 'Refresh',
        onClick: noop,
    },
    argTypes: {
        onClick: { control: false },
    },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {} satisfies Story;

export const Disabled = {
    args: {
        disabled: true,
    },
} satisfies Story;

export const Busy = {
    args: {
        busy: true,
        title: 'Refreshing',
    },
} satisfies Story;

export const ToolbarSet = {
    render: () => (
        <div className="storybook-row">
            <IconButton icon="add" title="Add" onClick={noop} />
            <IconButton icon="repo-pull" title="Pull" onClick={noop} />
            <IconButton icon="git-fetch" title="Fetch" onClick={noop} />
            <IconButton icon="trash" title="Delete" onClick={noop} />
            <IconButton icon="search" title="Search" onClick={noop} />
        </div>
    ),
} satisfies Story;
