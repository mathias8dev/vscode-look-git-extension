import { FileTypeIcon } from '@webview/shared/file-type-icon';
import type { CommitFileIconKind } from '@webview/shared/commit-file-icon-model';

interface CommitFileTypeIconProps {
    readonly kind: CommitFileIconKind;
}

export function CommitFileTypeIcon({ kind }: CommitFileTypeIconProps) {
    return <FileTypeIcon kind={kind} />;
}
