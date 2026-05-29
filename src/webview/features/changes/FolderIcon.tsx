import defaultFolderOpened from '@iconify/icons-vscode-icons/default-folder-opened';
import defaultFolder from '@iconify/icons-vscode-icons/default-folder';
import folderTypeAssetOpened from '@iconify/icons-vscode-icons/folder-type-asset-opened';
import folderTypeAsset from '@iconify/icons-vscode-icons/folder-type-asset';
import folderTypeComponentOpened from '@iconify/icons-vscode-icons/folder-type-component-opened';
import folderTypeComponent from '@iconify/icons-vscode-icons/folder-type-component';
import folderTypeConfigOpened from '@iconify/icons-vscode-icons/folder-type-config-opened';
import folderTypeConfig from '@iconify/icons-vscode-icons/folder-type-config';
import folderTypeDocsOpened from '@iconify/icons-vscode-icons/folder-type-docs-opened';
import folderTypeDocs from '@iconify/icons-vscode-icons/folder-type-docs';
import folderTypeGitOpened from '@iconify/icons-vscode-icons/folder-type-git-opened';
import folderTypeGit from '@iconify/icons-vscode-icons/folder-type-git';
import folderTypeImagesOpened from '@iconify/icons-vscode-icons/folder-type-images-opened';
import folderTypeImages from '@iconify/icons-vscode-icons/folder-type-images';
import folderTypeNodeOpened from '@iconify/icons-vscode-icons/folder-type-node-opened';
import folderTypeNode from '@iconify/icons-vscode-icons/folder-type-node';
import folderTypeSrcOpened from '@iconify/icons-vscode-icons/folder-type-src-opened';
import folderTypeSrc from '@iconify/icons-vscode-icons/folder-type-src';
import folderTypeTestOpened from '@iconify/icons-vscode-icons/folder-type-test-opened';
import folderTypeTest from '@iconify/icons-vscode-icons/folder-type-test';
import { IconifySvg, type IconifySvgData } from '../../shared/IconifySvg';
import { folderIconKindForName, type FolderIconKind } from './folderIconModel';

interface FolderIconProps {
    readonly name: string;
    readonly expanded: boolean;
}

export function FolderIcon({ name, expanded }: FolderIconProps) {
    return <IconifySvg className="folder-type-icon" icon={iconForKind(folderIconKindForName(name), expanded)} />;
}

function iconForKind(kind: FolderIconKind, expanded: boolean): IconifySvgData {
    switch (kind) {
        case 'asset':
            return expanded ? folderTypeAssetOpened : folderTypeAsset;
        case 'component':
            return expanded ? folderTypeComponentOpened : folderTypeComponent;
        case 'config':
            return expanded ? folderTypeConfigOpened : folderTypeConfig;
        case 'docs':
            return expanded ? folderTypeDocsOpened : folderTypeDocs;
        case 'git':
            return expanded ? folderTypeGitOpened : folderTypeGit;
        case 'images':
            return expanded ? folderTypeImagesOpened : folderTypeImages;
        case 'node':
            return expanded ? folderTypeNodeOpened : folderTypeNode;
        case 'src':
            return expanded ? folderTypeSrcOpened : folderTypeSrc;
        case 'test':
            return expanded ? folderTypeTestOpened : folderTypeTest;
        case 'folder':
            return expanded ? defaultFolderOpened : defaultFolder;
    }
}
