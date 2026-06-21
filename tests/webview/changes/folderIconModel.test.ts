import { describe, expect, it } from 'vitest';
import { folderIconKindForName } from '@webview/shared/folderIconModel';

describe('folderIconModel', () => {
    it('resolves known folder icon kinds from folder names', () => {
        expect(folderIconKindForName('src')).toBe('src');
        expect(folderIconKindForName('tests')).toBe('test');
        expect(folderIconKindForName('docs')).toBe('docs');
        expect(folderIconKindForName('assets')).toBe('asset');
        expect(folderIconKindForName('images')).toBe('images');
        expect(folderIconKindForName('components')).toBe('component');
        expect(folderIconKindForName('node_modules')).toBe('node');
        expect(folderIconKindForName('.git')).toBe('git');
        expect(folderIconKindForName('unknown')).toBe('folder');
    });
});
