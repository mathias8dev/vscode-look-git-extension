import { describe, expect, it } from 'vitest';
import { iconKindForPath, iconKindForStatusEntry, iconKindForStashFile } from '../../../src/webview/features/changes/fileIconModel';

describe('fileIconModel', () => {
    it('resolves common file icon kinds from paths', () => {
        expect(iconKindForPath('src/app.ts')).toBe('typescript');
        expect(iconKindForPath('src/app.jsx')).toBe('javascript');
        expect(iconKindForPath('package.json')).toBe('package');
        expect(iconKindForPath('README.md')).toBe('markdown');
        expect(iconKindForPath('.gitignore')).toBe('git');
        expect(iconKindForPath('vite.config.ts')).toBe('config');
        expect(iconKindForPath('assets/logo.svg')).toBe('image');
    });

    it('marks submodule status entries explicitly', () => {
        expect(iconKindForStatusEntry({
            indexStatus: 'M',
            workTreeStatus: ' ',
            filePath: 'modules/lib',
            isSubmodule: true,
        })).toBe('submodule');
    });

    it('resolves stash file icons from their file path', () => {
        expect(iconKindForStashFile({ status: 'M', filePath: 'src/styles.css' })).toBe('css');
    });
});
