import {
    defaultFolderIcons,
    folderIcons,
    type VscodeFolderIconNames,
} from '@webview/shared/vscode-icon-catalog.generated';

const fallbackFolderAliases: Readonly<Record<string, string>> = {
    asset: 'assets',
    documentation: 'docs',
    media: 'images',
    static: 'assets',
};

export function folderIconNamesForName(folderName: string): VscodeFolderIconNames {
    const normalizedName = folderName.toLowerCase();
    const catalogName = fallbackFolderAliases[normalizedName] ?? normalizedName;
    return folderIcons[catalogName] ?? defaultFolderIcons;
}
