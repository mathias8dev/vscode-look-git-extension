import { describe, expect, it } from 'vitest';
import { buildFileTree } from '@webview/shared/commit-file-tree-model';

describe('shared commit file tree model', () => {
    it('groups commit files into sorted folders before files', () => {
        const tree = buildFileTree([
            { status: 'M', filePath: 'README.md' },
            { status: 'A', filePath: 'src/history/HistoryWebview.tsx' },
            { status: 'D', filePath: 'src/history/old.ts' },
            { status: 'M', filePath: 'package.json' },
        ]);

        expect(tree.map((node) => node.name)).toEqual(['src', 'package.json', 'README.md']);
        expect(tree[0]?.children.map((node) => node.name)).toEqual(['history']);
        expect(tree[0]?.children[0]?.children.map((node) => node.name)).toEqual(['HistoryWebview.tsx', 'old.ts']);
        expect(tree[0]?.children[0]?.children[0]?.file?.filePath).toBe('src/history/HistoryWebview.tsx');
    });

    it('keeps submodule leaf metadata', () => {
        const tree = buildFileTree([
            { status: 'A', filePath: 'modules/auth-kit', isSubmodule: true },
        ]);

        expect(tree[0]?.name).toBe('modules');
        expect(tree[0]?.children[0]?.name).toBe('auth-kit');
        expect(tree[0]?.children[0]?.file?.isSubmodule).toBe(true);
    });

    it('keeps separate merge-parent changes for the same file', () => {
        const tree = buildFileTree([
            { status: 'M', filePath: 'src/shared.ts', parentHash: 'parent-one' },
            { status: 'M', filePath: 'src/shared.ts', parentHash: 'parent-two' },
        ]);
        const files = tree[0]?.children ?? [];
        expect(files).toHaveLength(2);
        expect(new Set(files.map(node => node.id)).size).toBe(2);
        expect(files.map(node => node.file?.parentHash)).toEqual(['parent-one', 'parent-two']);
    });
});
