import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FileTreeNodeView } from '../../../src/webview/features/graph/FileTreeNode';
import { buildFileTree } from '../../../src/webview/features/graph/commitFileTreeModel';
import { expectItem } from '../../helpers/assertions';

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

    it('renders module-like paths as ordinary file paths', () => {
        const node = expectItem(buildFileTree([{ status: 'M', filePath: 'modules/auth-kit' }]), 0);
        const markup = renderToStaticMarkup(<FileTreeNodeView node={node} depth={0} onDiff={() => undefined} />);

        expect(markup).toContain('modules');
    });
});
