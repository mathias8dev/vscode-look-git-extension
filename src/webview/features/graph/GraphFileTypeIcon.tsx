import { iconForFileKind } from '@webview/shared/fileIconAssets';
import { IconifySvg } from '@webview/shared/IconifySvg';
import type { GraphFileIconKind } from '@webview/features/graph/graphFileIconModel';

interface GraphFileTypeIconProps {
    readonly kind: GraphFileIconKind;
}

export function GraphFileTypeIcon({ kind }: GraphFileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
