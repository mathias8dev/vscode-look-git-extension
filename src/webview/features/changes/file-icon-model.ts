import type { StatusEntry, StashFileEntry } from '@protocol/changes/types';
import { iconKindForPath as iconKindForSharedPath, type WebviewFileIconKind } from '@webview/shared/file-icon-model';

export type FileIconKind = WebviewFileIconKind;

export function iconKindForStatusEntry(entry: StatusEntry): FileIconKind {
    return entry.isSubmodule ? 'submodule' : iconKindForPath(entry.filePath);
}

export function iconKindForStashFile(file: StashFileEntry): FileIconKind {
    return iconKindForPath(file.filePath);
}

export function iconKindForPath(filePath: string): FileIconKind {
    return iconKindForSharedPath(filePath);
}
