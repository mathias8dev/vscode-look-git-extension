// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BranchCommand } from '@protocol/graph/messages';
import type { BranchInfo, GraphSubmoduleInfo } from '@protocol/graph/types';
import { SubmoduleStatus } from '@protocol/shared/repo';
import { BranchPanel } from '@webview/features/graph/branch-panel';

describe('BranchPanel', () => {
    it('renders unpushed commit counts on local branches', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[branch('feature/not-pushed', { isCurrent: true, ahead: 3, behind: 2, upstream: 'origin/feature/not-pushed' })]}
                worktrees={[]}
                submodules={[]}
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

    it('marks local branches without upstream as not published when remotes exist', () => {
        const markup = renderToStaticMarkup(
            <BranchPanel
                branches={[branch('feature/login')]}
                worktrees={[]}
                submodules={[]}
                currentBranch="main"
                hasRemotes
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

        expect(markup).toContain('Branch is not published');
        expect(markup).toContain('branch-not-published');
        expect(markup).toContain('Publish');
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
                submodules={[]}
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
                submodules={[]}
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
                submodules={[]}
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
                submodules={[]}
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
                submodules={[]}
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

        expect(screen.getByTitle(/feature\/topic/)).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Collapse Branches'));
        expect(screen.queryByTitle(/feature\/topic/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Expand Branches'));
        expect(screen.getByTitle(/feature\/topic/)).toBeInTheDocument();
    });

    it('keeps branch rendering as a tree only', () => {
        render(
            <BranchPanel
                branches={[
                    branch('main', { isCurrent: true }),
                    branch('feature/topic'),
                    branch('feature/other'),
                ]}
                worktrees={[]}
                submodules={[]}
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

        expect(screen.getByText('feature')).toBeInTheDocument();
        expect(screen.queryByText('feature/topic')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('View as List')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Expand Branches')).not.toBeDisabled();
    });

    it('navigates from submodule rows without rendering nested submodule branches', () => {
        const onSelectSubmodule = vi.fn<(submodule: GraphSubmoduleInfo) => void>();

        render(
            <BranchPanel
                branches={[branch('main', { isCurrent: true })]}
                worktrees={[]}
                submodules={[submodule('modules/auth-kit')]}
                currentBranch="main"
                selectedBranchFilter={undefined}
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onSelectSubmodule={onSelectSubmodule}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        expect(screen.getByText('Submodules')).toBeInTheDocument();
        expect(screen.getByText('auth-kit')).toBeInTheDocument();
        expect(screen.getByText('dirty')).toBeInTheDocument();
        expect(screen.getByTitle('2 branches')).toHaveTextContent('2b');
        expect(screen.getByTitle('1 worktrees')).toHaveTextContent('1w');

        fireEvent.click(screen.getByTitle('modules/auth-kit'));
        expect(onSelectSubmodule).toHaveBeenCalledWith(expect.objectContaining({
            path: 'modules/auth-kit',
            name: 'auth-kit',
        }));

        expect(screen.getAllByText('Local')).toHaveLength(1);
        expect(screen.queryByTitle('feature/oauth')).not.toBeInTheDocument();
        expect(screen.queryByText('Remote')).not.toBeInTheDocument();
        expect(screen.queryByTitle('origin/release/1.4')).not.toBeInTheDocument();
        expect(screen.getAllByText('Worktrees')).toHaveLength(1);
        expect(screen.queryByText('oauth-sandbox')).not.toBeInTheDocument();
    });

    it('renders a main repository action while scoped to a submodule', () => {
        const onSelectMainRepository = vi.fn<() => void>();

        render(
            <BranchPanel
                branches={[branch('feature/oauth', { isCurrent: true })]}
                worktrees={[]}
                submodules={[]}
                selectedRepository={{ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' }}
                currentBranch="feature/oauth"
                selectedBranchFilter="feature/oauth"
                selectedWorktreePath={undefined}
                onSelectBranch={() => undefined}
                onSelectMainRepository={onSelectMainRepository}
                onBranchCommand={() => undefined}
                onFetch={() => undefined}
                onSelectWorktree={() => undefined}
                onOpenWorktree={() => undefined}
                onAddWorktree={() => undefined}
                onContextTarget={() => undefined}
            />,
        );

        fireEvent.click(screen.getByText('Main repository'));

        expect(onSelectMainRepository).toHaveBeenCalledOnce();
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

function submodule(path: string): GraphSubmoduleInfo {
    return {
        path,
        name: path.split('/').at(-1) ?? path,
        status: SubmoduleStatus.Dirty,
        branches: [
            branch('feature/oauth', { isCurrent: true }),
            branch('origin/release/1.4', { isRemote: true }),
        ],
        worktrees: [{
            path: '/repo/modules/auth-kit/.worktrees/oauth-sandbox',
            head: 'def4567',
            branch: 'refs/heads/oauth-sandbox',
            isMain: false,
            isDetached: false,
            isLocked: false,
        }],
    };
}
