import type { Meta, StoryObj } from '@storybook/react-vite';
import { Codicon, type CodiconName } from '@webview/shared/Codicon';

const icons = [
    'add',
    'check',
    'chevron-down',
    'chevron-right',
    'comment-discussion',
    'discard',
    'diff',
    'error',
    'fold-down',
    'fold-up',
    'folder-opened',
    'git-compare',
    'git-merge',
    'git-stash',
    'git-stash-apply',
    'go-to-file',
    'loading',
    'pass',
    'remove',
    'search',
    'source-control',
    'trash',
    'unarchive',
    'warning',
] satisfies readonly CodiconName[];

const meta = {
    title: 'Shared/Codicon',
    component: Codicon,
    args: {
        name: 'git-merge',
    },
} satisfies Meta<typeof Codicon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single = {} satisfies Story;

export const Spinning = {
    args: {
        name: 'loading',
        spin: true,
    },
} satisfies Story;

export const Gallery = {
    render: () => (
        <div className="storybook-grid">
            {icons.map((name) => (
                <div key={name} className="storybook-icon-card">
                    <Codicon name={name} spin={name === 'loading'} />
                    <span className="storybook-icon-label">{name}</span>
                </div>
            ))}
        </div>
    ),
} satisfies Story;
