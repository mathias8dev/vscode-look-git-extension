import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadIconForName } from '@webview/shared/file-icon-assets';
import { FileTypeIcon } from '@webview/shared/file-type-icon';
import { FolderIcon } from '@webview/shared/folder-icon';

describe('change icons', () => {
    it('renders Iconify vscode-icons SVGs for file types', async () => {
        await loadIconForName('file-type-typescript');
        const markup = renderToStaticMarkup(<FileTypeIcon kind="file-type-typescript" />);

        expect(markup).toContain('class="file-type-icon"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('<path');
    });

    it('renders a specific Dart file icon instead of the default fallback', async () => {
        await Promise.all([loadIconForName('file-type-dartlang'), loadIconForName('default-file')]);
        const dart = renderToStaticMarkup(<FileTypeIcon kind="file-type-dartlang" />);
        const fallback = renderToStaticMarkup(<FileTypeIcon kind="default-file" />);

        expect(dart).toContain('class="file-type-icon"');
        expect(dart).toContain('<path');
        expect(dart).not.toBe(fallback);
    });

    it('renders binary and properties file icons instead of the default fallback', async () => {
        await Promise.all([
            loadIconForName('file-type-binary'),
            loadIconForName('file-type-config'),
            loadIconForName('default-file'),
        ]);
        const binary = renderToStaticMarkup(<FileTypeIcon kind="file-type-binary" />);
        const properties = renderToStaticMarkup(<FileTypeIcon kind="file-type-config" />);
        const fallback = renderToStaticMarkup(<FileTypeIcon kind="default-file" />);

        expect(binary).toContain('<path');
        expect(properties).toContain('<path');
        expect(binary).not.toBe(fallback);
        expect(properties).not.toBe(fallback);
    });

    it('renders distinct closed and opened Iconify vscode-icons SVGs for folders', async () => {
        await Promise.all([loadIconForName('folder-type-src'), loadIconForName('folder-type-src-opened')]);
        const closed = renderToStaticMarkup(<FolderIcon name="src" expanded={false} />);
        const opened = renderToStaticMarkup(<FolderIcon name="src" expanded />);

        expect(closed).toContain('class="folder-type-icon"');
        expect(closed).toContain('<path');
        expect(opened).toContain('<path');
        expect(opened).not.toBe(closed);
    });

    it('renders theme-specific variants when the catalog provides them', async () => {
        await Promise.all([loadIconForName('file-type-rust'), loadIconForName('file-type-light-rust')]);
        const markup = renderToStaticMarkup(<FileTypeIcon kind="file-type-rust" />);

        expect(markup).toContain('icon-theme-dark');
        expect(markup).toContain('icon-theme-light');
        expect(markup.match(/<svg/g)).toHaveLength(2);
    });
});
