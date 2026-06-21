import { describe, expect, it } from 'vitest';
import { buildHistoryFileTree } from '@webview/features/history/historyFileTree';

describe('historyFileTree', () => {
    it('groups commit files into sorted folders before files', () => {
        const tree = buildHistoryFileTree([
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
        const tree = buildHistoryFileTree([
            { status: 'A', filePath: 'modules/auth-kit', isSubmodule: true },
        ]);

        expect(tree[0]?.name).toBe('modules');
        expect(tree[0]?.children[0]?.name).toBe('auth-kit');
        expect(tree[0]?.children[0]?.file?.isSubmodule).toBe(true);
    });
});
