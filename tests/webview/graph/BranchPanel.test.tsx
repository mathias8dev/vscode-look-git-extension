import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchPanel } from '../../../src/webview/features/graph/BranchPanel';

describe('BranchPanel', () => {
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
                onBranchCommand={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onWorktreeCommand={() => undefined}
                onAddWorktree={() => undefined}
            />,
        );

        expect(markup).toContain('Worktrees');
        expect(markup).toContain('release/1.0');
    });
});
