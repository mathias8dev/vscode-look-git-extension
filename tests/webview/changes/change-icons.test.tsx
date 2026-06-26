import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FileTypeIcon } from '@webview/shared/file-type-icon';
import { FolderIcon } from '@webview/shared/folder-icon';

describe('change icons', () => {
    it('renders Iconify vscode-icons SVGs for file types', () => {
        const markup = renderToStaticMarkup(<FileTypeIcon kind="typescript" />);

        expect(markup).toContain('class="file-type-icon"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('<path');
    });

    it('renders a specific Dart file icon instead of the default fallback', () => {
        const dart = renderToStaticMarkup(<FileTypeIcon kind="dart" />);
        const fallback = renderToStaticMarkup(<FileTypeIcon kind="file" />);

        expect(dart).toContain('class="file-type-icon"');
        expect(dart).toContain('<path');
        expect(dart).not.toBe(fallback);
    });

    it('renders binary and properties file icons instead of the default fallback', () => {
        const binary = renderToStaticMarkup(<FileTypeIcon kind="binary" />);
        const properties = renderToStaticMarkup(<FileTypeIcon kind="properties" />);
        const fallback = renderToStaticMarkup(<FileTypeIcon kind="file" />);

        expect(binary).toContain('<path');
        expect(properties).toContain('<path');
        expect(binary).not.toBe(fallback);
        expect(properties).not.toBe(fallback);
    });

    it('renders distinct closed and opened Iconify vscode-icons SVGs for folders', () => {
        const closed = renderToStaticMarkup(<FolderIcon name="src" expanded={false} />);
        const opened = renderToStaticMarkup(<FolderIcon name="src" expanded />);

        expect(closed).toContain('class="folder-type-icon"');
        expect(closed).toContain('<path');
        expect(opened).toContain('<path');
        expect(opened).not.toBe(closed);
    });
});
