import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphOperation, noop } from '../../storybookFixtures';
import { OperationStatus } from '../../../protocol/shared/operation';
import { GraphOperationNotice } from './GraphOperationNotice';

const meta = {
    title: 'Graph/GraphOperationNotice',
    component: GraphOperationNotice,
    args: {
        operation: graphOperation,
        onShowOutput: noop,
        onDismiss: noop,
    },
    argTypes: {
        onShowOutput: { control: false },
        onDismiss: { control: false },
    },
} satisfies Meta<typeof GraphOperationNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Conflict = {} satisfies Story;

export const Running = {
    args: {
        operation: {
            ...graphOperation,
            status: OperationStatus.Running,
        },
    },
} satisfies Story;
