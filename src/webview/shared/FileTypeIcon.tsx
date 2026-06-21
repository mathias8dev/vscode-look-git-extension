import { iconForFileKind } from '@webview/shared/fileIconAssets';
import { IconifySvg } from '@webview/shared/IconifySvg';
import type { WebviewFileIconKind } from '@webview/shared/fileIconModel';

interface FileTypeIconProps {
    readonly kind: WebviewFileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
