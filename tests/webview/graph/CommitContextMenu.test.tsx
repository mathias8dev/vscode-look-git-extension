import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommitContextMenu } from '../../../src/webview/features/graph/CommitContextMenu';

describe('CommitContextMenu', () => {
    it('renders worktree-aware commit actions', () => {
        const markup = renderToStaticMarkup(
            <CommitContextMenu
                state={{
                    hash: '1234567890abcdef',
                    hashes: ['1234567890abcdef'],
                    x: 0,
                    y: 0,
                    canGoToChild: true,
                    canGoToParent: true,
                    canUndoCommit: true,
                }}
                onClose={() => undefined}
                onCommand={() => undefined}
                onGoToChild={() => undefined}
                onGoToParent={() => undefined}
            />,
        );

        expect(markup).toContain('New Branch + Worktree from Here...');
        expect(markup).toContain('Compare Commit with Worktree...');
    });
});

