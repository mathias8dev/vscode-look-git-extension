import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop, stashFiles, submoduleStatusData, submodules } from '@webview/storybook-fixtures';
import { SubmoduleItem } from '@webview/features/changes/submodule-item';

const meta = {
    title: 'Changes/SubmoduleItem',
    component: SubmoduleItem,
    args: {
        submodule: submodules[0],
        expanded: true,
        statusData: submoduleStatusData,
        loadingStatus: false,
        focusRequest: 0,
        onToggle: noop,
        onOpenContextMenu: noop,
        onAction: noop,
        onReviewChanges: noop,
        expandedStashIndexes: [0],
        stashFilesByIndex: { 0: stashFiles },
        onRowAction: noop,
        onBulkAction: noop,
        onExplainSelection: noop,
        onSelectionContextTarget: noop,
        onOperationAction: noop,
        commitFeedback: undefined,
        commitMessageGenerating: false,
        generatedCommitMessage: undefined,
        commitMessageGenerationError: undefined,
        onCommit: noop,
        onCommitComposerContextTarget: noop,
        onGenerateCommitMessage: noop,
        onCreateStash: noop,
        onToggleStash: noop,
        onStashAction: noop,
        onStashFileDiff: noop,
    },
    argTypes: {
        onToggle: { control: false },
        onOpenContextMenu: { control: false },
        onAction: { control: false },
        onReviewChanges: { control: false },
        onRowAction: { control: false },
        onBulkAction: { control: false },
        onExplainSelection: { control: false },
        onSelectionContextTarget: { control: false },
        onOperationAction: { control: false },
        onCommit: { control: false },
        onCommitComposerContextTarget: { control: false },
        onGenerateCommitMessage: { control: false },
        onCreateStash: { control: false },
        onToggleStash: { control: false },
        onStashAction: { control: false },
        onStashFileDiff: { control: false },
    },
} satisfies Meta<typeof SubmoduleItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ExpandedDirty = {} satisfies Story;

export const Collapsed = {
    args: {
        expanded: false,
    },
} satisfies Story;

export const Loading = {
    args: {
        statusData: undefined,
        loadingStatus: true,
    },
} satisfies Story;
