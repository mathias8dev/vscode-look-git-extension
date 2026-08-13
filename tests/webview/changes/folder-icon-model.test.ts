import { describe, expect, it } from 'vitest';
import { folderIconNamesForName } from '@webview/shared/folder-icon-model';

describe('folderIconModel', () => {
    it('resolves known folder icon kinds from folder names', () => {
        expect(folderIconNamesForName('src')).toEqual({ closed: 'folder-type-src', opened: 'folder-type-src-opened' });
        expect(folderIconNamesForName('tests')).toEqual({ closed: 'folder-type-test', opened: 'folder-type-test-opened' });
        expect(folderIconNamesForName('docs')).toEqual({ closed: 'folder-type-docs', opened: 'folder-type-docs-opened' });
        expect(folderIconNamesForName('assets')).toEqual({ closed: 'folder-type-asset', opened: 'folder-type-asset-opened' });
        expect(folderIconNamesForName('images')).toEqual({ closed: 'folder-type-images', opened: 'folder-type-images-opened' });
        expect(folderIconNamesForName('components')).toEqual({ closed: 'folder-type-component', opened: 'folder-type-component-opened' });
        expect(folderIconNamesForName('node_modules')).toEqual({ closed: 'folder-type-node', opened: 'folder-type-node-opened' });
        expect(folderIconNamesForName('.git')).toEqual({ closed: 'folder-type-git', opened: 'folder-type-git-opened' });
        expect(folderIconNamesForName('unknown')).toEqual({ closed: 'default-folder', opened: 'default-folder-opened' });
    });

    it('preserves established folder aliases missing from the generated catalog', () => {
        expect(folderIconNamesForName('asset')).toEqual({ closed: 'folder-type-asset', opened: 'folder-type-asset-opened' });
        expect(folderIconNamesForName('static')).toEqual({ closed: 'folder-type-asset', opened: 'folder-type-asset-opened' });
        expect(folderIconNamesForName('documentation')).toEqual({ closed: 'folder-type-docs', opened: 'folder-type-docs-opened' });
        expect(folderIconNamesForName('media')).toEqual({ closed: 'folder-type-images', opened: 'folder-type-images-opened' });
    });
});
