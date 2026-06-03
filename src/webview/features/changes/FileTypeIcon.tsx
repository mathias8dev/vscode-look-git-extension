import { iconForFileKind } from '../../shared/fileIconAssets';
import { IconifySvg } from '../../shared/IconifySvg';
import type { FileIconKind } from './fileIconModel';

interface FileTypeIconProps {
    readonly kind: FileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
