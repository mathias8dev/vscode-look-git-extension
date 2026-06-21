import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatusEntry } from '@protocol/changes/types';
import type { ChangeListItem } from '@webview/features/changes/change-tree';
import { ChangeSectionId } from '@webview/features/changes/change-tree';
import { ChangeRow } from '@webview/features/changes/change-row';
import { ChangeSelectionMode } from '@webview/features/changes/changes-state';

const noopSelect = (_item: ChangeListItem, _mode: ChangeSelectionMode) => undefined;
const noopContext = (_item: ChangeListItem) => undefined;
const noopAction = (_item: ChangeListItem) => undefined;

const modifiedItem = itemFor(ChangeSectionId.Unstaged, {
    indexStatus: ' ',
    workTreeStatus: 'M',
    filePath: 'src/webview/features/changes/ChangeRow.tsx',
});

const renamedItem = itemFor(ChangeSectionId.Staged, {
    indexStatus: 'R',
    workTreeStatus: ' ',
    filePath: 'src/webview/shared/fileIconModel.ts',
    origPath: 'src/webview/features/changes/fileIconModel.ts',
});

const conflictItem = itemFor(ChangeSectionId.Conflicts, {
    indexStatus: 'U',
    workTreeStatus: 'U',
    filePath: 'src/webview/features/graph/GraphTable.tsx',
});

const meta = {
    title: 'Changes/ChangeRow',
    component: ChangeRow,
    args: {
        item: modifiedItem,
        depth: 0,
        selected: false,
        context: '{"webviewSection":"changes"}',
        onSelect: noopSelect,
        onOpenContextMenu: noopContext,
        onAction: noopAction,
    },
    argTypes: {
        onSelect: { control: false },
        onOpenContextMenu: { control: false },
        onAction: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-surface change-list">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof ChangeRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Modified = {} satisfies Story;

export const Selected = {
    args: {
        selected: true,
    },
} satisfies Story;

export const Renamed = {
    args: {
        item: renamedItem,
    },
} satisfies Story;

export const Conflict = {
    args: {
        item: conflictItem,
    },
} satisfies Story;

function itemFor(section: ChangeSectionId, entry: StatusEntry): ChangeListItem {
    return {
        id: `${section}:${entry.filePath}:${entry.origPath ?? ''}`,
        section,
        entry,
        isStaged: section === ChangeSectionId.Staged,
    };
}
