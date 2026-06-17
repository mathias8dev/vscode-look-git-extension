import type { Meta, StoryObj } from '@storybook/react-vite';
import { changeItem, changedFiles, conflictFiles, noop } from '../../storybookFixtures';
import { ChangeSectionId } from './changeTree';
import { ChangesSortMode, ChangesViewMode } from './changesState';
import { ChangeSectionView } from './ChangeSectionView';

const unstagedSection = {
    id: ChangeSectionId.Unstaged,
    title: 'Changes',
    items: changedFiles.map((entry) => changeItem(ChangeSectionId.Unstaged, entry)),
};

const conflictSection = {
    id: ChangeSectionId.Conflicts,
    title: 'Conflicts',
    items: conflictFiles.map((entry) => changeItem(ChangeSectionId.Conflicts, entry)),
};

const meta = {
    title: 'Changes/ChangeSectionView',
    component: ChangeSectionView,
    args: {
        section: unstagedSection,
        viewMode: ChangesViewMode.List,
        sortMode: ChangesSortMode.Path,
        collapsed: false,
        selectedItemIds: new Set(),
        contextForItem: () => '{"webviewSection":"changes"}',
        onToggleCollapsed: noop,
        onSelectItem: noop,
        onOpenSelectionContext: noop,
        onRowAction: noop,
        onBulkAction: noop,
    },
    argTypes: {
        selectedItemIds: { control: false },
        contextForItem: { control: false },
        onToggleCollapsed: { control: false },
        onSelectItem: { control: false },
        onOpenSelectionContext: { control: false },
        onRowAction: { control: false },
        onBulkAction: { control: false },
    },
} satisfies Meta<typeof ChangeSectionView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ListMode = {} satisfies Story;

export const TreeMode = {
    args: {
        viewMode: ChangesViewMode.Tree,
    },
} satisfies Story;

export const Conflicts = {
    args: {
        section: conflictSection,
    },
} satisfies Story;

export const Collapsed = {
    args: {
        collapsed: true,
    },
} satisfies Story;
