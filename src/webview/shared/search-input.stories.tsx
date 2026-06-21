import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchInput } from '@webview/shared/search-input';

const meta = {
    title: 'Shared/SearchInput',
    component: SearchInput,
    args: {
        value: '',
        placeholder: 'Search files',
        ariaLabel: 'Search files',
        onChange: () => undefined,
    },
    argTypes: {
        onChange: { control: false },
    },
} satisfies Meta<typeof SearchInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty = {} satisfies Story;

export const Filled = {
    args: {
        value: 'storybook',
    },
} satisfies Story;

export const Interactive = {
    render: () => <InteractiveSearchInput />,
} satisfies Story;

function InteractiveSearchInput() {
    const [value, setValue] = useState('graph');
    return (
        <div className="storybook-surface">
            <SearchInput value={value} placeholder="Search branches" ariaLabel="Search branches" onChange={setValue} />
        </div>
    );
}
