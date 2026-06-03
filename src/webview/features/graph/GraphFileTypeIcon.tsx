import { iconForFileKind } from '../../shared/fileIconAssets';
import { IconifySvg } from '../../shared/IconifySvg';
import type { GraphFileIconKind } from './graphFileIconModel';

interface GraphFileTypeIconProps {
    readonly kind: GraphFileIconKind;
}

export function GraphFileTypeIcon({ kind }: GraphFileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
