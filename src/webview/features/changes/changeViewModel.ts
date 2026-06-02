import type { StatusEntry } from '../../../protocol/changes/types';
import type { ChangeSection, ChangeListItem } from './changeTree';
import { statusLabel } from './changeTree';
import { ChangesSortMode } from './changesState';

export function filterAndSortSections(
    sections: readonly ChangeSection[],
    pathFilter: string,
    sortMode: ChangesSortMode,
): readonly ChangeSection[] {
    const normalizedFilter = pathFilter.trim().toLowerCase();
    return sections.map((section) => ({
        ...section,
        items: sortItems(filterItems(section.items, normalizedFilter), sortMode),
    }));
}

export function flattenedItems(sections: readonly ChangeSection[]): readonly ChangeListItem[] {
    return sections.flatMap((section) => section.items);
}

export function selectedItemsForIds(
    sections: readonly ChangeSection[],
    selectedItemIds: readonly string[],
): readonly ChangeListItem[] {
    const selectedIds = new Set(selectedItemIds);
    return flattenedItems(sections).filter((item) => selectedIds.has(item.id));
}

function filterItems(items: readonly ChangeListItem[], normalizedFilter: string): readonly ChangeListItem[] {
    if (!normalizedFilter) { return items; }
    return items.filter((item) => matchesPathFilter(item.entry, normalizedFilter));
}

function matchesPathFilter(entry: StatusEntry, normalizedFilter: string): boolean {
    return entry.filePath.toLowerCase().includes(normalizedFilter)
        || (entry.origPath?.toLowerCase().includes(normalizedFilter) ?? false);
}

function sortItems(items: readonly ChangeListItem[], sortMode: ChangesSortMode): readonly ChangeListItem[] {
    return [...items].sort((left, right) => compareItems(left, right, sortMode));
}

function compareItems(left: ChangeListItem, right: ChangeListItem, sortMode: ChangesSortMode): number {
    switch (sortMode) {
        case ChangesSortMode.Name:
            return byName(left, right) || byPath(left, right);
        case ChangesSortMode.Status:
            return byStatus(left, right) || byPath(left, right);
        case ChangesSortMode.Directory:
            return byDirectory(left, right) || byPath(left, right);
        case ChangesSortMode.Path:
            return byPath(left, right);
    }
}

function byStatus(left: ChangeListItem, right: ChangeListItem): number {
    return statusLabel(left.entry).localeCompare(statusLabel(right.entry));
}

function byDirectory(left: ChangeListItem, right: ChangeListItem): number {
    return directoryName(left.entry.filePath).localeCompare(directoryName(right.entry.filePath));
}

function byPath(left: ChangeListItem, right: ChangeListItem): number {
    return left.entry.filePath.localeCompare(right.entry.filePath);
}

function byName(left: ChangeListItem, right: ChangeListItem): number {
    return fileName(left.entry.filePath).localeCompare(fileName(right.entry.filePath));
}

function directoryName(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/');
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
}
