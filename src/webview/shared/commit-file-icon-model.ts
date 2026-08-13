import type { CommitFileChange } from '@protocol/shared/commit';
import { iconKindForPath, type WebviewFileIconKind } from '@webview/shared/file-icon-model';

export type CommitFileIconKind = WebviewFileIconKind;

export function iconKindForCommitFile(file: CommitFileChange): CommitFileIconKind {
    return file.isSubmodule ? 'file-type-git' : iconKindForPath(file.filePath);
}
