import { describe, expect, it } from 'vitest';
import { buildPathTree, sortedPathChildren } from '../src/webview/pathTree';
import { StashFileState } from '../src/webview/stashState';

describe('webview pure state helpers', () => {
    it('builds a compact path tree without repeated child scans', () => {
        const tree = buildPathTree([
            { filePath: 'src/commands/index.ts' },
            { filePath: 'src/commands/reset.ts' },
            { filePath: 'README.md' },
        ], (entry) => entry.filePath);

        expect(tree.entries).toEqual([{ filePath: 'README.md' }]);
        const [srcCommands] = sortedPathChildren(tree);
        expect(srcCommands.name).toBe('src/commands');
        expect(srcCommands.fullPath).toBe('src/commands');
        expect(srcCommands.entries.map((entry) => entry.filePath)).toEqual([
            'src/commands/index.ts',
            'src/commands/reset.ts',
        ]);
    });

    it('invalidates expanded stash files when stash identity changes', () => {
        const state = new StashFileState<{ filePath: string }>();

        state.sync([{ index: 0, message: 'first' }]);
        expect(state.toggle(0)).toEqual({ expanded: true, shouldRequestFiles: true });
        state.setFiles(0, [{ filePath: 'old.txt' }]);
        expect(state.getFiles(0)).toEqual([{ filePath: 'old.txt' }]);

        state.sync([{ index: 0, message: 'second' }]);

        expect(state.isExpanded(0)).toBe(false);
        expect(state.getFiles(0)).toBeUndefined();
        expect(state.toggle(0)).toEqual({ expanded: true, shouldRequestFiles: true });
    });
});
