import type { Meta, StoryObj } from '@storybook/react-vite';
import { GraphOperationCategory } from '@protocol/graph/messages';
import { branches, graphOperation, graphSubmodules, noop, worktrees } from '@webview/storybook-fixtures';
import { BranchPanel } from '@webview/features/graph/branch-panel';

const meta = {
    title: 'Graph/BranchPanel',
    component: BranchPanel,
    args: {
        branches,
        worktrees,
        submodules: graphSubmodules,
        currentBranch: 'feature/storybook',
        hasRemotes: true,
        selectedBranchFilter: 'feature/storybook',
        selectedWorktreePath: '/workspace/look-git',
        onSelectBranch: noop,
        onBranchCommand: noop,
        onFetch: noop,
        onSelectWorktree: noop,
        onOpenWorktree: noop,
        onAddWorktree: noop,
        onContextTarget: noop,
    },
    argTypes: {
        onSelectBranch: { control: false },
        onSelectMainRepository: { control: false },
        onSelectSubmodule: { control: false },
        onBranchCommand: { control: false },
        onFetch: { control: false },
        onSelectWorktree: { control: false },
        onOpenWorktree: { control: false },
        onAddWorktree: { control: false },
        onContextTarget: { control: false },
    },
} satisfies Meta<typeof BranchPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MainRepository = {} satisfies Story;

export const Fetching = {
    args: {
        operationStatus: {
            ...graphOperation,
            category: GraphOperationCategory.Repository,
            command: 'fetch',
        },
    },
} satisfies Story;

export const SubmoduleScope = {
    args: {
        selectedRepository: {
            kind: 'submodule',
            path: 'vendor/ui-kit',
            label: 'ui-kit',
        },
    },
} satisfies Story;
