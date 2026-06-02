import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchPanel } from '../../../src/webview/features/graph/BranchPanel';

describe('BranchPanel', () => {
    it('renders unpushed commit counts on local branches', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[{
                    name: 'feature/not-pushed',
                    isRemote: false,
                    isCurrent: false,
                    hash: 'abc1234',
                    upstream: 'origin/feature/not-pushed',
                    ahead: 3,
                    behind: undefined,
                }]}
                worktrees={[]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(markup).toContain('feature/not-pushed');
        expect(markup).toContain('3 commits not pushed');
        expect(markup).toContain('codicon-cloud-upload');
        expect(markup).toContain('branch-ahead');
    });

    it('renders worktrees from graph data', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[]}
                worktrees={[{
                    path: '/repo/worktrees/release',
                    head: '1234567890abcdef',
                    branch: 'release/1.0',
                    isMain: false,
                    isDetached: false,
                    isLocked: false,
                }]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(markup).toContain('Worktrees');
        expect(markup).toContain('release/1.0');
    });
});
