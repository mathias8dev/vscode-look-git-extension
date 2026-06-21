import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileTypeIcon } from '@webview/shared/FileTypeIcon';
import type { WebviewFileIconKind } from '@webview/shared/fileIconModel';

const fileKinds = [
    'typescript',
    'javascript',
    'json',
    'markdown',
    'css',
    'html',
    'image',
    'binary',
    'dart',
    'flutter',
    'python',
    'go',
    'rust',
    'java',
    'kotlin',
    'swift',
    'php',
    'ruby',
    'csharp',
    'c',
    'cpp',
    'yaml',
    'xml',
    'vue',
    'svelte',
    'astro',
    'shell',
    'powershell',
    'docker',
    'toml',
    'sql',
    'graphql',
    'prisma',
    'tailwind',
    'xcode',
    'plist',
    'gradle',
    'maven',
    'config',
    'properties',
    'package',
    'git',
    'submodule',
    'file',
] satisfies readonly WebviewFileIconKind[];

const meta = {
    title: 'Shared/FileTypeIcon',
    component: FileTypeIcon,
    args: {
        kind: 'typescript',
    },
} satisfies Meta<typeof FileTypeIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single = {} satisfies Story;

export const Gallery = {
    render: () => (
        <div className="storybook-grid">
            {fileKinds.map((kind) => (
                <div key={kind} className="storybook-icon-card">
                    <FileTypeIcon kind={kind} />
                    <span className="storybook-icon-label">{kind}</span>
                </div>
            ))}
        </div>
    ),
} satisfies Story;
