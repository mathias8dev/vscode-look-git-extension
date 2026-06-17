import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop, stashFiles, submoduleStatusData, submodules } from '../../storybookFixtures';
import { submoduleStashKey } from './changesState';
import { SubmoduleSection } from './SubmoduleSection';

const meta = {
    title: 'Changes/SubmoduleSection',
    component: SubmoduleSection,
    args: {
        submodules,
        expandedPaths: ['vendor/ui-kit'],
        statusByPath: { 'vendor/ui-kit': submoduleStatusData },
        expandedStashKeys: [submoduleStashKey('vendor/ui-kit', 0)],
        stashFilesByKey: { [submoduleStashKey('vendor/ui-kit', 0)]: stashFiles },
        commitFeedbackByPath: {},
        commitMessageGenerationRequestIdByPath: {},
        generatedCommitMessageByPath: {},
        commitMessageGenerationErrorByPath: {},
        loadingStatusPaths: [],
        commitFocusRequestByPath: {},
        onToggle: noop,
        onContextTarget: noop,
        onAction: noop,
        onUpdateAll: noop,
        onReviewChanges: noop,
        onRowAction: noop,
        onBulkAction: noop,
        onExplainSelection: noop,
        onSelectionContextTarget: noop,
        onOperationAction: noop,
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
        onContextTarget: { control: false },
        onAction: { control: false },
        onUpdateAll: { control: false },
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
} satisfies Meta<typeof SubmoduleSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedStatuses = {} satisfies Story;

export const LoadingOneSubmodule = {
    args: {
        expandedPaths: ['vendor/ui-kit', 'vendor/not-ready'],
        loadingStatusPaths: ['vendor/not-ready'],
    },
} satisfies Story;
