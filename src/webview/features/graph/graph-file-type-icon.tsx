import { iconForFileKind } from '@webview/shared/file-icon-assets';
import { IconifySvg } from '@webview/shared/iconify-svg';
import type { GraphFileIconKind } from '@webview/features/graph/graph-file-icon-model';

interface GraphFileTypeIconProps {
    readonly kind: GraphFileIconKind;
}

export function GraphFileTypeIcon({ kind }: GraphFileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
