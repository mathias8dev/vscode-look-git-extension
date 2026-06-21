import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommitFileTree } from '@webview/features/graph/CommitFileTree';
import { FileTreeNodeView } from '@webview/features/graph/FileTreeNode';
import { buildFileTree } from '@webview/features/graph/commitFileTreeModel';
import { ViewMode } from '@webview/shared/viewMode';
import { expectItem } from '@tests/helpers/assertions';

describe('commitFileTree', () => {
    it('builds nested folders for commit file paths', () => {
        const tree = buildFileTree([{ status: 'M', filePath: 'src/app.ts' }]);
        const src = expectItem(tree, 0);
        const app = expectItem(src.children, 0);

        expect(src.isFolder).toBe(true);
        expect(app.file?.filePath).toBe('src/app.ts');
    });

    it('renders diff actions for commit files', () => {
        const node = expectItem(buildFileTree([{ status: 'M', filePath: 'src/app.ts' }]), 0);
        const child = expectItem(node.children, 0);
        const markup = renderToStaticMarkup(<FileTreeNodeView node={child} depth={1} onDiff={() => undefined} />);

        expect(markup).toContain('Open diff');
    });

    it('can render file rows without diff actions', () => {
        const node = expectItem(buildFileTree([{ status: '?', filePath: 'src/app.ts' }]), 0);
        const child = expectItem(node.children, 0);
        const markup = renderToStaticMarkup(<FileTreeNodeView node={child} depth={1} onDiff={() => undefined} diffable={false} />);

        expect(markup).not.toContain('Open diff');
        expect(markup).toContain('status-letter-untracked');
    });

    it('renders the selected file row with the visual selection state', () => {
        const node = expectItem(buildFileTree([{ status: 'M', filePath: 'src/app.ts' }]), 0);
        const child = expectItem(node.children, 0);
        const markup = renderToStaticMarkup(
            <FileTreeNodeView
                node={child}
                depth={1}
                onDiff={() => undefined}
                selectedFileId={child.id}
            />,
        );

        expect(markup).toContain('aria-selected="true"');
    });

    it('renders module-like paths as ordinary file paths', () => {
        const node = expectItem(buildFileTree([{ status: 'M', filePath: 'modules/auth-kit' }]), 0);
        const markup = renderToStaticMarkup(<FileTreeNodeView node={node} depth={0} onDiff={() => undefined} />);

        expect(markup).toContain('modules');
    });

    it('renders list mode file rows with full paths', () => {
        const markup = renderToStaticMarkup(
            <CommitFileTree
                files={[{ status: 'M', filePath: 'src/app.ts' }]}
                viewMode={ViewMode.List}
                onDiff={() => undefined}
            />,
        );

        expect(markup).toContain('src/app.ts');
    });
});
