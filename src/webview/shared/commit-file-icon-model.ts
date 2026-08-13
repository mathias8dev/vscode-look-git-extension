import type { CommitFileChange } from '@protocol/shared/commit';
import { iconKindForPath, type WebviewFileIconKind } from '@webview/shared/file-icon-model';

export type CommitFileIconKind = WebviewFileIconKind;

export function iconKindForCommitFile(file: CommitFileChange): CommitFileIconKind {
    if (file.isSubmodule) { return 'submodule'; }
    const kind = iconKindForPath(file.filePath);
    return kind === 'submodule' ? 'file' : kind;
}
