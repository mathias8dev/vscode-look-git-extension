import type { CommitFileChange } from '../../../protocol/graph/types';

export type GraphFileIconKind =
    | 'typescript'
    | 'javascript'
    | 'json'
    | 'markdown'
    | 'css'
    | 'html'
    | 'image'
    | 'config'
    | 'package'
    | 'git'
    | 'file';

export function iconKindForCommitFile(file: CommitFileChange): GraphFileIconKind {
    return iconKindForPath(file.filePath);
}

function iconKindForPath(filePath: string): GraphFileIconKind {
    const name = fileName(filePath).toLowerCase();
    const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';

    if (name === 'package.json') { return 'package'; }
    if (name.startsWith('.git') || name === 'gitignore' || name === 'gitattributes') { return 'git'; }
    if (isConfigFile(name)) { return 'config'; }

    switch (extension) {
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return 'javascript';
        case 'json':
        case 'jsonc':
            return 'json';
        case 'md':
        case 'mdx':
            return 'markdown';
        case 'css':
        case 'scss':
        case 'sass':
        case 'less':
            return 'css';
        case 'html':
        case 'htm':
            return 'html';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'svg':
            return 'image';
        default:
            return 'file';
    }
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}

function isConfigFile(name: string): boolean {
    return name.endsWith('config.js')
        || name.endsWith('config.ts')
        || name.endsWith('config.json')
        || name.endsWith('rc')
        || name.includes('.config.')
        || name.startsWith('.');
}
