import defaultFile from '@iconify/icons-vscode-icons/default-file';
import fileTypeConfig from '@iconify/icons-vscode-icons/file-type-config';
import fileTypeCss from '@iconify/icons-vscode-icons/file-type-css';
import fileTypeGit from '@iconify/icons-vscode-icons/file-type-git';
import fileTypeHtml from '@iconify/icons-vscode-icons/file-type-html';
import fileTypeImage from '@iconify/icons-vscode-icons/file-type-image';
import fileTypeJsOfficial from '@iconify/icons-vscode-icons/file-type-js-official';
import fileTypeJson from '@iconify/icons-vscode-icons/file-type-json';
import fileTypeMarkdown from '@iconify/icons-vscode-icons/file-type-markdown';
import fileTypeNpm from '@iconify/icons-vscode-icons/file-type-npm';
import fileTypeTypescriptOfficial from '@iconify/icons-vscode-icons/file-type-typescript-official';
import { IconifySvg, type IconifySvgData } from '../../shared/IconifySvg';
import type { GraphFileIconKind } from './graphFileIconModel';

interface GraphFileTypeIconProps {
    readonly kind: GraphFileIconKind;
}

export function GraphFileTypeIcon({ kind }: GraphFileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForKind(kind)} />;
}

function iconForKind(kind: GraphFileIconKind): IconifySvgData {
    switch (kind) {
        case 'typescript':
            return fileTypeTypescriptOfficial;
        case 'javascript':
            return fileTypeJsOfficial;
        case 'json':
            return fileTypeJson;
        case 'markdown':
            return fileTypeMarkdown;
        case 'css':
            return fileTypeCss;
        case 'html':
            return fileTypeHtml;
        case 'image':
            return fileTypeImage;
        case 'package':
            return fileTypeNpm;
        case 'git':
            return fileTypeGit;
        case 'config':
            return fileTypeConfig;
        case 'file':
            return defaultFile;
    }
}
