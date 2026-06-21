import type { Meta, StoryObj } from '@storybook/react-vite';
import { noop } from '@webview/storybook-fixtures';
import { ErrorNotice } from '@webview/shared/error-notice';

const meta = {
    title: 'Shared/ErrorNotice',
    component: ErrorNotice,
    args: {
        error: {
            code: 'gitOperationFailed',
            message: 'Could not reset current branch',
            operation: 'git reset --hard bbbbbbb',
            recoverable: true,
        },
    },
} satisfies Meta<typeof ErrorNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MessageOnly = {} satisfies Story;

export const WithActions = {
    args: {
        primaryAction: { label: 'Show Output', onClick: noop },
        secondaryAction: { label: 'Dismiss', onClick: noop },
    },
} satisfies Story;
