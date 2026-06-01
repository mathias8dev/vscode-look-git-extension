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
                    worktreePath: '/repo/.worktrees/chore-ci-matrix',
                    worktreeIsMain: false,
                    worktreeIsLocked: false,
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
        expect(markup).toContain('New Worktree from Branch...');
        expect(markup).toContain('Open Branch Worktree');
        expect(markup).toContain('Reveal Branch Worktree in File Explorer');
        expect(markup).toContain("Compare with &#x27;main&#x27;");
        expect(markup).toContain('Show Diff with Working Tree');
        expect(markup).toContain('Compare Branch with Worktree...');
        expect(markup).toContain('Show Diff with Branch Worktree');
        expect(markup).toContain("Rebase &#x27;main&#x27; onto &#x27;chore/ci-matrix&#x27;");
        expect(markup).toContain("Merge &#x27;chore/ci-matrix&#x27; into &#x27;main&#x27;");
        expect(markup).toContain('Push...');
        expect(markup).toContain('Pull Branch Worktree');
        expect(markup).toContain('Push Branch Worktree');
        expect(markup).toContain('Lock Branch Worktree');
        expect(markup).toContain('Unlock Branch Worktree');
        expect(markup).toContain('Remove Branch Worktree...');
        expect(markup).toContain('Rename...');
        expect(markup).toContain('Delete');
    });

    it('disables branch-worktree actions when no worktree is checked out for the branch', () => {
        const markup = renderToStaticMarkup(
            <BranchContextMenu
                state={{
                    branch: 'feature/no-worktree',
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

        expect(markup).toContain('New Worktree from Branch...');
        expect(markup.match(/disabled=""/g)).toHaveLength(8);
    });
});
