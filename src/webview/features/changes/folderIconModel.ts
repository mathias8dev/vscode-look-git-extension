export type FolderIconKind =
    | 'asset'
    | 'component'
    | 'config'
    | 'docs'
    | 'folder'
    | 'git'
    | 'images'
    | 'node'
    | 'src'
    | 'test';

export function folderIconKindForName(folderName: string): FolderIconKind {
    const normalized = folderName.toLowerCase();
    switch (normalized) {
        case '.git':
        case '.github':
        case '.gitlab':
            return 'git';
        case '.config':
        case 'config':
        case 'configs':
        case 'configuration':
        case 'settings':
            return 'config';
        case 'src':
        case 'source':
        case 'sources':
            return 'src';
        case 'test':
        case 'tests':
        case '__tests__':
        case 'spec':
        case 'specs':
            return 'test';
        case 'doc':
        case 'docs':
        case 'documentation':
            return 'docs';
        case 'asset':
        case 'assets':
        case 'static':
            return 'asset';
        case 'image':
        case 'images':
        case 'img':
        case 'media':
            return 'images';
        case 'component':
        case 'components':
            return 'component';
        case 'node_modules':
            return 'node';
        default:
            return 'folder';
    }
}
