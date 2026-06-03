// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BranchCommand } from '../../../src/protocol/graph/messages';
import type { BranchInfo } from '../../../src/protocol/graph/types';
import { BranchPanel } from '../../../src/webview/features/graph/BranchPanel';

describe('BranchPanel', () => {
    it('renders unpushed commit counts on local branches', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[branch('feature/not-pushed', { isCurrent: true, ahead: 3, behind: 2, upstream: 'origin/feature/not-pushed' })]}
                worktrees={[]}
                currentBranch="feature/not-pushed"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
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
        expect(markup).toContain('2 commits to pull');
        expect(markup).toContain('codicon-cloud-download');
        expect(markup).toContain('branch-behind');
        expect(markup).toContain('current branch');
        expect(markup).toContain('branch-current-indicator');
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
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(markup).toContain('Worktrees');
        expect(markup).toContain('release/1.0');
    });

    it('uses VS Code icons matching the branch side panel actions', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[
                    branch('main', { isCurrent: true }),
                    branch('feature/topic'),
                ]}
                worktrees={[]}
                currentBranch="main"
                selectedBranchFilter="feature/topic"
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(markup).toContain('codicon-add');
        expect(markup).toContain('codicon-repo-pull');
        expect(markup).toContain('codicon-trash');
        expect(markup).toContain('codicon-arrow-swap');
        expect(markup).toContain('codicon-search');
        expect(markup).toContain('codicon-git-fetch');
        expect(markup).toContain('codicon-expand-all');
        expect(markup).toContain('codicon-collapse-all');
    });

    it('runs branch side panel actions for the selected local branch', () => {
        const onBranchCommand = vi.fn<(command: BranchCommand, branch: string, isRemote: boolean) => void>();
        const onFetch = vi.fn<() => void>();
        const onSelectBranch = vi.fn<(branch: string | undefined) => void>();

        render(
            <BranchPanel
                branches={[
                    branch('main', { isCurrent: true }),
                    branch('feature/topic'),
                ]}
                worktrees={[]}
                currentBranch="main"
                selectedBranchFilter="feature/topic"
                selectedWorktreePath={undefined}
                onSelectBranch={onSelectBranch}
                onBranchCommand={onBranchCommand}
                onFetch={onFetch}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        fireEvent.click(screen.getByLabelText('Create Branch from feature/topic'));
        fireEvent.click(screen.getByLabelText('Update Selected Branch'));
        fireEvent.click(screen.getByLabelText('Delete Selected Branch'));
        fireEvent.click(screen.getByLabelText('Compare with Local'));
        fireEvent.click(screen.getByLabelText('Show My Branch'));
        fireEvent.click(screen.getByLabelText('Fetch'));

        expect(onBranchCommand).toHaveBeenCalledWith('newBranchFrom', 'feature/topic', false);
        expect(onBranchCommand).toHaveBeenCalledWith('update', 'feature/topic', false);
        expect(onBranchCommand).toHaveBeenCalledWith('delete', 'feature/topic', false);
        expect(onBranchCommand).toHaveBeenCalledWith('compareWithCurrent', 'feature/topic', false);
        expect(onSelectBranch).toHaveBeenCalledWith('main');
        expect(onFetch).toHaveBeenCalledOnce();
    });

    it('disables update for selected remote branches but keeps remote delete available', () => {
        render(
            <BranchPanel
                branches={[
                    branch('main', { isCurrent: true }),
                    branch('origin/feature/topic', { isRemote: true }),
                ]}
                worktrees={[]}
                currentBranch="main"
                selectedBranchFilter="origin/feature/topic"
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(screen.getByLabelText('Update Selected Branch')).toBeDisabled();
        expect(screen.getByLabelText('Delete Selected Branch')).not.toBeDisabled();
    });

    it('expands and collapses branch folders from the side panel', () => {
        render(
            <BranchPanel
                branches={[
                    branch('main', { isCurrent: true }),
                    branch('feature/topic'),
                ]}
                worktrees={[]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(screen.getByTitle('feature/topic')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Collapse Branches'));
        expect(screen.queryByTitle('feature/topic')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Expand Branches'));
        expect(screen.getByTitle('feature/topic')).toBeInTheDocument();
    });
});

function branch(name: string, overrides: Partial<BranchInfo> = {}): BranchInfo {
    return {
        name,
        isRemote: false,
        isCurrent: false,
        hash: 'abc1234',
        ...overrides,
    };
}
