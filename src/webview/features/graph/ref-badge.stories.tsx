import type { Meta, StoryObj } from '@storybook/react-vite';
import { RefBadge } from '@webview/features/graph/ref-badge';

const meta = {
    title: 'Graph/RefBadge',
    component: RefBadge,
    args: {
        parsed: {
            kind: 'local',
            label: 'feature/storybook',
            fullRef: 'refs/heads/feature/storybook',
        },
    },
} satisfies Meta<typeof RefBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Local = {} satisfies Story;

export const Remote = {
    args: {
        parsed: {
            kind: 'remote',
            label: 'origin/main',
            fullRef: 'refs/remotes/origin/main',
        },
    },
} satisfies Story;

export const Tag = {
    args: {
        parsed: {
            kind: 'tag',
            label: 'v1.1.0',
            fullRef: 'refs/tags/v1.1.0',
        },
    },
} satisfies Story;
