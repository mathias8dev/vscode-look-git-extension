import type { ChangeListItem } from '@webview/features/changes/changeTree';

export const CHANGE_SECTION_PAGE_SIZE = 250;

export interface VisibleChangeItems {
    readonly items: readonly ChangeListItem[];
    readonly hasMore: boolean;
    readonly nextLimit: number;
}

export function visibleChangeItems(
    items: readonly ChangeListItem[],
    limit: number,
    pageSize = CHANGE_SECTION_PAGE_SIZE,
): VisibleChangeItems {
    const normalizedLimit = Math.max(pageSize, limit);
    return {
        items: items.slice(0, normalizedLimit),
        hasMore: items.length > normalizedLimit,
        nextLimit: normalizedLimit + pageSize,
    };
}
