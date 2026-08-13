import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileTypeIcon } from '@webview/shared/file-type-icon';
import { vscodeIconNames } from '@webview/shared/vscode-icon-catalog.generated';

const meta = {
    title: 'Shared/FileTypeIcon',
    component: FileTypeIcon,
    args: {
        kind: 'file-type-typescript',
    },
} satisfies Meta<typeof FileTypeIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single = {} satisfies Story;

export const Gallery = {
    render: () => (
        <div className="storybook-grid">
            {vscodeIconNames.map((kind) => (
                <div key={kind} className="storybook-icon-card">
                    <FileTypeIcon kind={kind} />
                    <span className="storybook-icon-label">{kind}</span>
                </div>
            ))}
        </div>
    ),
} satisfies Story;
