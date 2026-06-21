import type { ChangesSelectionContextTarget } from '@protocol/changes/types';
import { ChangeSectionId, type ChangeListItem } from '@webview/features/changes/change-tree';

export function changesSelectionTarget(
    items: readonly ChangeListItem[],
    submodulePath?: string,
): ChangesSelectionContextTarget {
    const stageableItems = items.filter((item) => item.section === ChangeSectionId.Unstaged);
    const stagedItems = items.filter((item) => item.section === ChangeSectionId.Staged);
    const stashableItems = items.filter((item) => item.section === ChangeSectionId.Unstaged || item.section === ChangeSectionId.Staged);
    const untrackedItems = stageableItems.filter(isUntracked);
    const trackedUnstagedItems = stageableItems.filter((item) => !isUntracked(item));
    return {
        kind: 'selection',
        ...(submodulePath ? { submodulePath } : {}),
        filePaths: uniqueFilePaths(items),
        stageFilePaths: uniqueFilePaths(stageableItems),
        unstageFilePaths: uniqueFilePaths(stagedItems),
        discardFilePaths: uniqueFilePaths(stageableItems),
        stashFilePaths: uniqueFilePaths(stashableItems),
        patchStagedFilePaths: uniqueFilePaths(stagedItems),
        patchUnstagedFilePaths: uniqueFilePaths(trackedUnstagedItems),
        patchUntrackedFilePaths: uniqueFilePaths(untrackedItems),
        stashIncludeUntracked: stashableItems.some((item) => isUntracked(item)),
    };
}

export function isChangeListItem(item: ChangeListItem | undefined): item is ChangeListItem {
    return item !== undefined;
}

function uniqueFilePaths(items: readonly ChangeListItem[]): readonly string[] {
    return Array.from(new Set(items.map((item) => item.entry.filePath)));
}

function isUntracked(item: ChangeListItem): boolean {
    return item.entry.indexStatus === '?' || item.entry.workTreeStatus === '?';
}
