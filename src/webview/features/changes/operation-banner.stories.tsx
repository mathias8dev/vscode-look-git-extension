import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConflictState } from '@protocol/changes/types';
import { OperationAction } from '@webview/features/changes/operation-commands';
import { OperationBanner } from '@webview/features/changes/operation-banner';

const noop = () => undefined;
const onAction = (_action: OperationAction) => undefined;

const meta = {
    title: 'Changes/OperationBanner',
    component: OperationBanner,
    args: {
        conflictState: ConflictState.Rebase,
        conflictCount: 3,
        conflictsOnly: false,
        onToggleConflictsOnly: noop,
        onAction,
    },
    argTypes: {
        onToggleConflictsOnly: { control: false },
        onAction: { control: false },
    },
} satisfies Meta<typeof OperationBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RebaseConflicts = {} satisfies Story;

export const MergeReadyToContinue = {
    args: {
        conflictState: ConflictState.Merge,
        conflictCount: 0,
        conflictsOnly: true,
    },
} satisfies Story;
