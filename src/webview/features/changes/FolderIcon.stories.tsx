import type { Meta, StoryObj } from '@storybook/react-vite';
import { FolderIcon } from '@webview/features/changes/FolderIcon';

const folderNames = [
    'src',
    'components',
    'config',
    'docs',
    '.git',
    'images',
    'node_modules',
    'tests',
    'features',
] as const;

const meta = {
    title: 'Changes/FolderIcon',
    component: FolderIcon,
    args: {
        name: 'src',
        expanded: false,
    },
} satisfies Meta<typeof FolderIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single = {} satisfies Story;

export const Gallery = {
    render: () => (
        <div className="storybook-grid">
            {folderNames.map((name) => (
                <div key={name} className="storybook-icon-card">
                    <div className="storybook-row">
                        <FolderIcon name={name} expanded={false} />
                        <FolderIcon name={name} expanded />
                    </div>
                    <span className="storybook-icon-label">{name}</span>
                </div>
            ))}
        </div>
    ),
} satisfies Story;
