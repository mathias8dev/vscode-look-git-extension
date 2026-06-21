import { iconForFileKind } from '@webview/shared/file-icon-assets';
import { IconifySvg } from '@webview/shared/iconify-svg';
import type { WebviewFileIconKind } from '@webview/shared/file-icon-model';

interface FileTypeIconProps {
    readonly kind: WebviewFileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
