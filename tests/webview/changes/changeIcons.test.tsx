import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FileTypeIcon } from '../../../src/webview/features/changes/FileTypeIcon';
import { FolderIcon } from '../../../src/webview/features/changes/FolderIcon';

describe('change icons', () => {
    it('renders Iconify vscode-icons SVGs for file types', () => {
        const markup = renderToStaticMarkup(<FileTypeIcon kind="typescript" />);

        expect(markup).toContain('class="file-type-icon"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('<path');
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
