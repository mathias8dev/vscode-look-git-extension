import type { CommitFileChange } from '@protocol/graph/types';
import { iconKindForPath, type WebviewFileIconKind } from '@webview/shared/fileIconModel';

export type GraphFileIconKind = WebviewFileIconKind;

export function iconKindForCommitFile(file: CommitFileChange): GraphFileIconKind {
    if (file.isSubmodule) { return 'submodule'; }
    const kind = iconKindForPath(file.filePath);
    return kind === 'submodule' ? 'file' : kind;
}
