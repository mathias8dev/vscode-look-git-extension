// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Resource } from '@protocol/shared/base';
import type { RepositorySummary } from '@protocol/shared/repo';
import { RepositoryNavigator } from '@webview/shared/repository-navigator';

describe('RepositoryNavigator', () => {
    it('renders children directly for a single repository', () => {
        renderNavigator({
            repositories: { status: 'ready', data: [repositorySummary('main')] },
            activeContextId: { status: 'ready', data: 'main' },
        });

        expect(screen.getByText('Repository content')).toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('keeps active repository content visible while exposing child repositories', () => {
        const onNavigate = vi.fn<(contextId: string | undefined) => void>();
        renderNavigator({
            activeContextId: { status: 'ready', data: 'platform' },
            onNavigate,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('platform', '/workspace/platform'),
                    repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                ],
            },
        });

        expect(screen.getByText('Repository content')).toBeInTheDocument();
        expect(screen.getByText('api')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show nested repositories' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /api/ }));

        expect(onNavigate).toHaveBeenCalledWith('api');
    });

    it('navigates from a child repository back to its active parent repository', () => {
        const onNavigate = vi.fn<(contextId: string | undefined) => void>();
        renderNavigator({
            activeContextId: { status: 'ready', data: 'plugin' },
            onNavigate,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('app', '/workspace/app'),
                    repositorySummary('plugin', '/workspace/app/plugin', 'main', 'app'),
                ],
            },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Back to parent repository' }));

        expect(onNavigate).toHaveBeenCalledWith('app');
    });

    it('shows a repository overview by default when multiple repositories are available', () => {
        renderNavigator();

        expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
        expect(screen.getByText('3 repositories')).toBeInTheDocument();
        expect(screen.getByText('/workspace/api')).toBeInTheDocument();
        expect(screen.queryByText('Repository content')).not.toBeInTheDocument();
    });

    it('lists a workspace repository before navigating to its children', () => {
        const onNavigate = vi.fn<(contextId: string | undefined) => void>();
        renderNavigator({
            onNavigate,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('workspace', '/workspace'),
                    repositorySummary('api', '/workspace/modules/api', 'main', 'workspace'),
                    repositorySummary('web', '/workspace/modules/web', 'main', 'workspace'),
                ],
            },
        });

        expect(screen.getByText('1 repository')).toBeInTheDocument();
        expect(screen.getByText('workspace')).toBeInTheDocument();
        expect(screen.queryByText('api')).not.toBeInTheDocument();
        expect(screen.queryByText('web')).not.toBeInTheDocument();
        const list = screen.getByRole('list');
        fireEvent.click(within(list).getByRole('button', { name: /workspace/ }));

        expect(onNavigate).toHaveBeenCalledWith('workspace');
    });

    it('filters repositories by label path branch or upstream', () => {
        renderNavigator();

        fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'desktop' } });

        expect(screen.getByText('desktop')).toBeInTheDocument();
        expect(screen.queryByText('api')).not.toBeInTheDocument();
        expect(screen.queryByText('look-git')).not.toBeInTheDocument();
    });

    it('filters repositories by visible status and repository stats', () => {
        const { rerender } = renderNavigator();

        fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'changed' } });

        expect(screen.getByText('desktop')).toBeInTheDocument();
        expect(screen.queryByText('api')).not.toBeInTheDocument();
        expect(screen.queryByText('look-git')).not.toBeInTheDocument();

        rerender(
            <RepositoryNavigator
                repositories={{ status: 'ready', data: repositorySummaries }}
                activeContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'submodules' } });

        expect(screen.getByText('look-git')).toBeInTheDocument();
        expect(screen.queryByText('api')).not.toBeInTheDocument();
        expect(screen.queryByText('desktop')).not.toBeInTheDocument();

        rerender(
            <RepositoryNavigator
                repositories={{
                    status: 'ready',
                    data: [
                        repositorySummary('platform', '/workspace/platform'),
                        repositorySummary('tools', '/workspace/tools'),
                        repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                    ],
                }}
                activeContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'child repositories' } });

        expect(screen.getByText('platform')).toBeInTheDocument();
        expect(screen.queryByText('tools')).not.toBeInTheDocument();
    });

    it('emits navigate and open-in-new-window actions from repository rows', () => {
        const onNavigate = vi.fn<(contextId: string | undefined) => void>();
        const onOpenInNewWindow = vi.fn<(contextId: string) => void>();

        renderNavigator({ onNavigate, onOpenInNewWindow });

        fireEvent.click(screen.getByRole('button', { name: /api/ }));
        expect(onNavigate).toHaveBeenCalledWith('api');

        const desktopRow = screen.getByText('desktop').closest('[role="listitem"]');
        if (!(desktopRow instanceof HTMLElement)) {
            throw new Error('Expected desktop repository row.');
        }
        fireEvent.click(within(desktopRow).getByRole('button', { name: 'Open repository in new window' }));

        expect(onOpenInNewWindow).toHaveBeenCalledWith('desktop');
    });

    it('returns from a top-level repository to the repository root', () => {
        const onNavigate = vi.fn<(contextId: string | undefined) => void>();
        renderNavigator({
            activeContextId: { status: 'ready', data: 'workspace' },
            onNavigate,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('workspace', '/workspace'),
                    repositorySummary('app', '/workspace/modules/app', 'main', 'workspace'),
                ],
            },
        });

        expect(screen.getByText('Repository content')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back to repositories' }));

        expect(onNavigate).toHaveBeenCalledWith(undefined);
    });

    it('can collapse child repositories without hiding active repository content', () => {
        renderNavigator({
            activeContextId: { status: 'ready', data: 'platform' },
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('platform', '/workspace/platform'),
                    repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                ],
            },
        });

        const disclosure = screen.getByRole('button', { name: 'Repositories (1)' });
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('api')).toBeInTheDocument();

        fireEvent.click(disclosure);

        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('api')).not.toBeInTheDocument();
        expect(screen.getByText('Repository content')).toBeInTheDocument();
    });

    it('renders loading and error resources', () => {
        const { rerender } = renderNavigator({
            repositories: { status: 'loading' },
            activeContextId: { status: 'loading' },
        });

        expect(screen.getByText('Loading repositories')).toBeInTheDocument();

        rerender(
            <RepositoryNavigator
                repositories={{ status: 'error', error: { code: 'refreshFailed', message: 'scan failed', recoverable: true } }}
                activeContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        expect(screen.getByText('Could not load repositories')).toBeInTheDocument();
        expect(screen.getByText('scan failed')).toBeInTheDocument();
    });
});

interface RenderNavigatorOptions {
    readonly repositories?: Resource<readonly RepositorySummary[]>;
    readonly activeContextId?: Resource<string | undefined>;
    readonly onNavigate?: (contextId: string | undefined) => void;
    readonly onOpenInNewWindow?: (contextId: string) => void;
}

function renderNavigator({
    repositories = { status: 'ready', data: repositorySummaries },
    activeContextId = { status: 'ready', data: undefined },
    onNavigate = () => undefined,
    onOpenInNewWindow = () => undefined,
}: RenderNavigatorOptions = {}) {
    return render(
        <RepositoryNavigator
            repositories={repositories}
            activeContextId={activeContextId}
            title="Repositories"
            onNavigate={onNavigate}
            onOpenInNewWindow={onOpenInNewWindow}
        >
            <span>Repository content</span>
        </RepositoryNavigator>,
    );
}

const repositorySummaries = [
    repositorySummary('look-git', '/workspace/look-git', 'feature/multimodule'),
    repositorySummary('api', '/workspace/api', 'main'),
    repositorySummary('desktop', '/workspace/apps/desktop', 'release/1.2'),
] satisfies readonly RepositorySummary[];

function repositorySummary(id: string, cwd = `/workspace/${id}`, branch = 'main', parentId?: string): RepositorySummary {
    return {
        context: { id, cwd, kind: 'main', label: id, parentId },
        branch,
        upstream: `origin/${branch}`,
        hasRemote: true,
        branchCount: 3,
        submoduleCount: id === 'look-git' ? 2 : 0,
        worktreeCount: id === 'desktop' ? 2 : 1,
        stagedCount: id === 'look-git' ? 1 : 0,
        unstagedCount: id === 'desktop' ? 2 : 0,
        conflictCount: 0,
    };
}
