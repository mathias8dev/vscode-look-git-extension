import { describe, expect, it } from 'vitest';
import { ConflictState } from '../../../src/protocol/changes/types';
import { ChangesSortMode } from '../../../src/webview/features/changes/changesState';
import { buildChangeSections } from '../../../src/webview/features/changes/changeTree';
import { filterAndSortSections, flattenedItems, selectedItemsForIds } from '../../../src/webview/features/changes/changeViewModel';

const sections = buildChangeSections({
    conflicts: [],
    staged: [
        { indexStatus: 'A', workTreeStatus: ' ', filePath: 'src/new.ts' },
        { indexStatus: 'M', workTreeStatus: ' ', filePath: 'README.md' },
    ],
    unstaged: [
        { indexStatus: ' ', workTreeStatus: 'D', filePath: 'docs/old.md' },
        { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
    ],
    conflictState: ConflictState.None,
    stashes: [],
    submodules: [],
});

describe('changeViewModel', () => {
    it('filters changes by current and original path', () => {
        const filtered = filterAndSortSections(buildChangeSections({
            conflicts: [],
            staged: [],
            unstaged: [
                { indexStatus: 'R', workTreeStatus: ' ', filePath: 'src/new-name.ts', origPath: 'legacy/old-name.ts' },
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'README.md' },
            ],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        }), 'legacy', ChangesSortMode.Path);

        expect(flattenedItems(filtered).map((item) => item.entry.filePath)).toEqual(['src/new-name.ts']);
    });

    it('sorts changes by name, path, status, and directory in the UI layer', () => {
        expect(flattenedItems(filterAndSortSections(sections, '', ChangesSortMode.Name)).map((item) => item.entry.filePath)).toEqual([
            'src/new.ts',
            'README.md',
            'src/app.ts',
            'docs/old.md',
        ]);
        expect(flattenedItems(filterAndSortSections(sections, '', ChangesSortMode.Path)).map((item) => item.entry.filePath)).toEqual([
            'README.md',
            'src/new.ts',
            'docs/old.md',
            'src/app.ts',
        ]);
        expect(flattenedItems(filterAndSortSections(sections, '', ChangesSortMode.Status)).map((item) => item.entry.filePath)).toEqual([
            'src/new.ts',
            'README.md',
            'docs/old.md',
            'src/app.ts',
        ]);
        expect(flattenedItems(filterAndSortSections(sections, '', ChangesSortMode.Directory)).map((item) => item.entry.filePath)).toEqual([
            'README.md',
            'src/new.ts',
            'docs/old.md',
            'src/app.ts',
        ]);
    });

    it('resolves selected ids against currently visible sections', () => {
        const visible = filterAndSortSections(sections, 'src', ChangesSortMode.Path);
        const selected = selectedItemsForIds(visible, ['staged:src/new.ts:', 'unstaged:docs/old.md:']);

        expect(selected.map((item) => item.entry.filePath)).toEqual(['src/new.ts']);
    });
});
