import type { Meta, StoryObj } from '@storybook/react-vite';
import { ViewMode } from './viewMode';
import { ViewModeToggle } from './ViewModeToggle';

const meta = {
    title: 'Shared/ViewModeToggle',
    component: ViewModeToggle,
    args: {
        viewMode: ViewMode.Tree,
        onChange: () => undefined,
    },
    argTypes: {
        onChange: { control: false },
    },
} satisfies Meta<typeof ViewModeToggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TreeMode = {} satisfies Story;

export const ListMode = {
    args: {
        viewMode: ViewMode.List,
    },
} satisfies Story;
