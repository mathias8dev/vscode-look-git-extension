import { iconNamesForFileKind } from '@webview/shared/file-icon-assets';
import type { WebviewFileIconKind } from '@webview/shared/file-icon-model';
import { ThemedIconifySvg } from '@webview/shared/themed-iconify-svg';

interface FileTypeIconProps {
    readonly kind: WebviewFileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    const icons = iconNamesForFileKind(kind);
    return <ThemedIconifySvg className="file-type-icon" dark={icons.dark} light={icons.light} />;
}
