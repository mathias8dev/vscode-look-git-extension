import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchContextMenu } from '../../../src/webview/features/graph/BranchContextMenu';

describe('BranchContextMenu', () => {
    it('renders branch actions with current branch labels', () => {
        const markup = renderToStaticMarkup(
            <BranchContextMenu
                state={{
                    branch: 'chore/ci-matrix',
                    isRemote: false,
                    isCurrent: false,
                    currentBranch: 'main',
                    x: 0,
                    y: 0,
                }}
                onClose={() => undefined}
                onCommand={() => undefined}
            />,
        );

        expect(markup).toContain('Checkout');
        expect(markup).toContain("New Branch from &#x27;chore/ci-matrix&#x27;...");
        expect(markup).toContain("Checkout and Rebase onto &#x27;main&#x27;");
        expect(markup).toContain("Compare with &#x27;main&#x27;");
        expect(markup).toContain('Show Diff with Working Tree');
        expect(markup).toContain("Rebase &#x27;main&#x27; onto &#x27;chore/ci-matrix&#x27;");
        expect(markup).toContain("Merge &#x27;chore/ci-matrix&#x27; into &#x27;main&#x27;");
        expect(markup).toContain('Push...');
        expect(markup).toContain('Rename...');
        expect(markup).toContain('Delete');
    });
});
