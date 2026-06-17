import type { Meta, StoryObj } from '@storybook/react-vite';
import { OperationStatus } from '../../protocol/shared/operation';
import { OperationNotice } from './OperationNotice';

const noop = () => undefined;

const meta = {
    title: 'Shared/OperationNotice',
    component: OperationNotice,
    args: {
        status: OperationStatus.Running,
        message: 'Fetching repository',
        detail: 'origin/main',
    },
} satisfies Meta<typeof OperationNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Running = {} satisfies Story;

export const Success = {
    args: {
        status: OperationStatus.Success,
        message: 'Push completed',
        detail: 'feature/context-menu pushed to origin',
    },
} satisfies Story;

export const FailedWithActions = {
    args: {
        status: OperationStatus.Failed,
        message: 'Pull failed',
        detail: 'Resolve credentials or inspect Git output.',
        actions: [
            { label: 'Show Output', onClick: noop },
            { label: 'Retry', onClick: noop },
        ],
    },
} satisfies Story;
