import { describe, expect, it } from 'vitest';
import { CHANGE_SECTION_PAGE_SIZE, visibleChangeItems } from '../../../src/webview/features/changes/changePagination';
import { ChangeSectionId, type ChangeListItem } from '../../../src/webview/features/changes/changeTree';

function items(count: number): readonly ChangeListItem[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `item-${index}`,
        section: ChangeSectionId.Unstaged,
        isStaged: false,
        entry: { indexStatus: ' ', workTreeStatus: 'M', filePath: `file-${index}.ts` },
    }));
}

describe('changePagination', () => {
    it('limits very large sections to a stable first page', () => {
        const visible = visibleChangeItems(items(CHANGE_SECTION_PAGE_SIZE + 10), CHANGE_SECTION_PAGE_SIZE);

        expect(visible.items).toHaveLength(CHANGE_SECTION_PAGE_SIZE);
        expect(visible.hasMore).toBe(true);
        expect(visible.nextLimit).toBe(CHANGE_SECTION_PAGE_SIZE * 2);
    });

    it('reports no remaining items when the section fits', () => {
        const visible = visibleChangeItems(items(3), CHANGE_SECTION_PAGE_SIZE);

        expect(visible.items).toHaveLength(3);
        expect(visible.hasMore).toBe(false);
    });
});
