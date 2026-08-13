import { iconNamesForFileKind } from '@webview/shared/file-icon-assets';
import { folderIconNamesForName } from '@webview/shared/folder-icon-model';
import { ThemedIconifySvg } from '@webview/shared/themed-iconify-svg';

interface FolderIconProps {
    readonly name: string;
    readonly expanded: boolean;
}

export function FolderIcon({ name, expanded }: FolderIconProps) {
    const names = folderIconNamesForName(name);
    const icons = iconNamesForFileKind(expanded ? names.opened : names.closed);
    return <ThemedIconifySvg className="folder-type-icon" dark={icons.dark} light={icons.light} />;
}
