import { iconForFileKind } from '@webview/shared/fileIconAssets';
import { IconifySvg } from '@webview/shared/IconifySvg';
import type { FileIconKind } from '@webview/features/changes/fileIconModel';

interface FileTypeIconProps {
    readonly kind: FileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
