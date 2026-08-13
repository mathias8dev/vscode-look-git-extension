import { iconForFileKind } from '@webview/shared/file-icon-assets';
import { IconifySvg } from '@webview/shared/iconify-svg';
import type { CommitFileIconKind } from '@webview/shared/commit-file-icon-model';

interface CommitFileTypeIconProps {
    readonly kind: CommitFileIconKind;
}

export function CommitFileTypeIcon({ kind }: CommitFileTypeIconProps) {
    return <IconifySvg className="file-type-icon" icon={iconForFileKind(kind)} />;
}
