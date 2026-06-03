import type { CommitFileChange } from '../../../protocol/graph/types';
import { iconKindForPath, type WebviewFileIconKind } from '../../shared/fileIconModel';

export type GraphFileIconKind = Exclude<WebviewFileIconKind, 'submodule'>;

export function iconKindForCommitFile(file: CommitFileChange): GraphFileIconKind {
    const kind = iconKindForPath(file.filePath);
    return kind === 'submodule' ? 'file' : kind;
}
