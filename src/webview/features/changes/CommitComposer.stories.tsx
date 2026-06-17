import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConflictState } from '../../../protocol/changes/types';
import { noop } from '../../storybookFixtures';
import { CommitComposer } from './CommitComposer';

const meta = {
    title: 'Changes/CommitComposer',
    component: CommitComposer,
    args: {
        stagedCount: 2,
        conflictState: ConflictState.None,
        feedback: undefined,
        focusRequest: 0,
        generatingMessage: false,
        generatedMessage: undefined,
        generationError: undefined,
        onGenerateMessage: noop,
        onCommit: noop,
        onOpenNativeMenu: noop,
    },
    argTypes: {
        onGenerateMessage: { control: false },
        onCommit: { control: false },
        onOpenNativeMenu: { control: false },
    },
} satisfies Meta<typeof CommitComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready = {} satisfies Story;

export const Generating = {
    args: {
        generatingMessage: true,
    },
} satisfies Story;

export const GeneratedMessage = {
    args: {
        generatedMessage: {
            requestId: 'storybook-generated',
            message: 'feat(webview): add component previews',
        },
    },
} satisfies Story;

export const GenerationError = {
    args: {
        generationError: {
            code: 'optionalDataUnavailable',
            message: 'Monthly credit limit reached.',
            operation: 'generate commit message',
            recoverable: true,
        },
    },
} satisfies Story;

export const BlockedByConflicts = {
    args: {
        conflictState: ConflictState.Rebase,
    },
} satisfies Story;

export const SuccessFeedback = {
    args: {
        feedback: {
            success: true,
            message: 'Committed successfully.',
        },
    },
} satisfies Story;
