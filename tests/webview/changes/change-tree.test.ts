import { describe, expect, it } from 'vitest';
import { buildChangeSections, buildChangeTree, statusLabel } from '@webview/features/changes/change-tree';
import { ConflictState } from '@protocol/changes/types';
import { SubmoduleStatus } from '@protocol/shared/repo';

describe('changeTree', () => {
    it('builds semantic sections in display order', () => {
        const sections = buildChangeSections({
            conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.ts' }],
            staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'src/new.ts' }],
            unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'README.md' }],
            conflictState: ConflictState.Merge,
            stashes: [],
            submodules: [],
        });

        expect(sections.map((section) => section.id)).toEqual(['conflicts', 'staged', 'unstaged']);
        expect(sections.map((section) => section.items.length)).toEqual([1, 1, 1]);
    });

    it('groups paths into tree nodes without backend layout data', () => {
        const sections = buildChangeSections({
            conflicts: [],
            staged: [],
            unstaged: [
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/features/a.ts' },
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/features/b.ts' },
            ],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        });
        const tree = buildChangeTree(sections[2]?.items ?? []);

        expect(tree).toHaveLength(1);
        expect(tree[0]).toEqual(expect.objectContaining({ name: 'src', path: 'src' }));
        expect(tree[0]?.children[0]).toEqual(expect.objectContaining({ name: 'features', path: 'src/features' }));
        expect(tree[0]?.children[0]?.children.map((node) => node.name)).toEqual(['a.ts', 'b.ts']);
    });

    it('keeps tree folders stable while sorting files with the provided comparator', () => {
        const sections = buildChangeSections({
            conflicts: [],
            staged: [],
            unstaged: [
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/features/a.ts' },
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/features/b.ts' },
            ],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        });
        const tree = buildChangeTree(
            sections[2]?.items ?? [],
            (left, right) => right.entry.filePath.localeCompare(left.entry.filePath),
        );

        expect(tree[0]?.children[0]?.children.map((node) => node.name)).toEqual(['b.ts', 'a.ts']);
    });

    it('derives user-facing status labels in the UI layer', () => {
        expect(statusLabel({ indexStatus: 'A', workTreeStatus: ' ', filePath: 'new.ts' })).toBe('Added');
        expect(statusLabel({ indexStatus: ' ', workTreeStatus: 'D', filePath: 'old.ts' })).toBe('Deleted');
        expect(statusLabel({ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.ts' })).toBe('Conflict');
        expect(statusLabel({ indexStatus: 'M', workTreeStatus: ' ', filePath: 'module', isSubmodule: true })).toBe('Submodule');
        expect(statusLabel({
            indexStatus: 'M',
            workTreeStatus: ' ',
            filePath: 'module',
            isSubmodule: true,
            submoduleStatus: SubmoduleStatus.Dirty,
        })).toBe('Submodule dirty');
    });
});
