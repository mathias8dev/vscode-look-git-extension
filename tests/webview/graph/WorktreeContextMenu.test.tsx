import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorktreeContextMenu } from '../../../src/webview/features/graph/WorktreeContextMenu';
import type { WorktreeInfo } from '../../../src/protocol/graph/types';

describe('WorktreeContextMenu', () => {
    it('renders worktree context actions', () => {
        const markup = renderToStaticMarkup(
            <WorktreeContextMenu
                state={{ worktree: worktree(false), x: 0, y: 0 }}
                onClose={() => undefined}
                onCommand={() => undefined}
                onShowDetails={() => undefined}
            />,
        );

        expect(markup).toContain('Open');
        expect(markup).toContain('Open in New Window');
        expect(markup).toContain('Reveal in File Explorer');
        expect(markup).toContain('Show Details');
        expect(markup).toContain('Show Diff with HEAD');
        expect(markup).toContain('Show Diff with Main Worktree');
        expect(markup).toContain('Commit...');
        expect(markup).toContain('Force Remove...');
    });

    it('disables destructive and self-compare actions for the main worktree', () => {
        const markup = renderToStaticMarkup(
            <WorktreeContextMenu
                state={{ worktree: worktree(true), x: 0, y: 0 }}
                onClose={() => undefined}
                onCommand={() => undefined}
                onShowDetails={() => undefined}
            />,
        );

        expect(markup).toContain('Show Diff with Main Worktree');
        expect(markup).toContain('Remove...');
        expect(markup.match(/disabled=""/g)).toHaveLength(5);
    });

    it('disables only unlock for an unlocked linked worktree', () => {
        const markup = renderToStaticMarkup(
            <WorktreeContextMenu
                state={{ worktree: worktree(false), x: 0, y: 0 }}
                onClose={() => undefined}
                onCommand={() => undefined}
                onShowDetails={() => undefined}
            />,
        );

        expect(markup).toContain('Lock Worktree');
        expect(markup).toContain('Unlock Worktree');
        expect(markup.match(/disabled=""/g)).toHaveLength(1);
    });
});

function worktree(isMain: boolean): WorktreeInfo {
    return {
        path: isMain ? '/repo' : '/repo/.worktrees/topic',
        head: '1234567890abcdef',
        branch: isMain ? 'main' : 'feature/topic',
        isMain,
        isDetached: false,
        isLocked: isMain,
    };
}
