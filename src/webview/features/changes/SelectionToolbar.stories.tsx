import type { Meta, StoryObj } from '@storybook/react-vite';
import { changeItem, changedFiles, conflictFiles, stagedFiles, noop } from '@webview/storybookFixtures';
import { ChangeSectionId } from '@webview/features/changes/changeTree';
import { SelectionToolbar } from '@webview/features/changes/SelectionToolbar';

const selectedItems = [
    changeItem(ChangeSectionId.Unstaged, changedFiles[0]),
    changeItem(ChangeSectionId.Staged, stagedFiles[0]),
    changeItem(ChangeSectionId.Conflicts, conflictFiles[0]),
];

const meta = {
    title: 'Changes/SelectionToolbar',
    component: SelectionToolbar,
    args: {
        selectedItems,
        onAction: noop,
        onClear: noop,
    },
    argTypes: {
        onAction: { control: false },
        onClear: { control: false },
    },
} satisfies Meta<typeof SelectionToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MultiSelection = {} satisfies Story;

export const OneFile = {
    args: {
        selectedItems: selectedItems.slice(0, 1),
    },
} satisfies Story;
