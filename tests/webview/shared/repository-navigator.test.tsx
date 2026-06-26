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

    it('shows a repository overview by default when multiple repositories are available', () => {
        renderNavigator();

        expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
        expect(screen.getByText('3 repositories')).toBeInTheDocument();
        expect(screen.getByText('/workspace/api')).toBeInTheDocument();
        expect(screen.queryByText('Repository content')).not.toBeInTheDocument();
    });

    it('lists child repositories instead of the implicit parent workspace repository', () => {
        renderNavigator({
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('workspace', '/workspace'),
                    repositorySummary('api', '/workspace/modules/api', 'main', 'workspace'),
                    repositorySummary('web', '/workspace/modules/web', 'main', 'workspace'),
                ],
            },
        });

        expect(screen.getByLabelText('Repository location')).toHaveTextContent('workspace');
        expect(screen.getByText('2 repositories')).toBeInTheDocument();
        expect(screen.getByText('api')).toBeInTheDocument();
        expect(screen.getByText('web')).toBeInTheDocument();
        const list = screen.getByRole('list');
        expect(within(list).queryByText('workspace')).not.toBeInTheDocument();
    });

    it('opens nested repositories from the repository row without selecting parent content', () => {
        const onNavigate = vi.fn<(contextId: string) => void>();
        const onShowRepositoryList = vi.fn<(contextId: string | undefined) => void>();
        const { rerender } = renderNavigator({
            onNavigate,
            onShowRepositoryList,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('platform', '/workspace/platform'),
                    repositorySummary('tools', '/workspace/tools'),
                    repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                    repositorySummary('web', '/workspace/platform/modules/web', 'main', 'platform'),
                ],
            },
        });

        expect(screen.getByText('2 repositories')).toBeInTheDocument();
        expect(screen.getByText('platform')).toBeInTheDocument();
        expect(screen.getByText('tools')).toBeInTheDocument();
        expect(screen.queryByText('api')).not.toBeInTheDocument();

        const platformRow = screen.getByText('platform').closest('[role="listitem"]');
        if (!(platformRow instanceof HTMLElement)) {
            throw new Error('Expected platform repository row.');
        }
        fireEvent.click(within(platformRow).getByRole('button', { name: /platform/ }));

        expect(onNavigate).not.toHaveBeenCalled();
        expect(onShowRepositoryList).toHaveBeenCalledWith('platform');

        rerender(
            <RepositoryNavigator
                repositories={{
                    status: 'ready',
                    data: [
                        repositorySummary('platform', '/workspace/platform'),
                        repositorySummary('tools', '/workspace/tools'),
                        repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                        repositorySummary('web', '/workspace/platform/modules/web', 'main', 'platform'),
                    ],
                }}
                activeContextId={{ status: 'ready', data: undefined }}
                listContextId={{ status: 'ready', data: 'platform' }}
                title="Repositories"
                onNavigate={onNavigate}
                onShowRepositoryList={onShowRepositoryList}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        expect(screen.getByLabelText('Repository location')).toHaveTextContent('platform');
        expect(screen.getByText('2 repositories')).toBeInTheDocument();
        expect(screen.getByText('api')).toBeInTheDocument();
        expect(screen.getByText('web')).toBeInTheDocument();
        expect(screen.queryByText('tools')).not.toBeInTheDocument();
        expect(screen.queryByText('/workspace/platform')).not.toBeInTheDocument();
    });

    it('returns from a child repository list to its parent repository list', () => {
        const onShowRepositoryList = vi.fn<(contextId: string | undefined) => void>();
        renderNavigator({
            listContextId: { status: 'ready', data: 'platform' },
            onShowRepositoryList,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('platform', '/workspace/platform'),
                    repositorySummary('tools', '/workspace/tools'),
                    repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                ],
            },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Back to parent folder' }));

        expect(onShowRepositoryList).toHaveBeenCalledWith(undefined);
    });

    it('opens nested repository levels', () => {
        const onShowRepositoryList = vi.fn<(contextId: string | undefined) => void>();
        const { rerender } = renderNavigator({
            onShowRepositoryList,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('workspace', '/workspace'),
                    repositorySummary('app', '/workspace/modules/app', 'main', 'workspace'),
                    repositorySummary('plugin', '/workspace/modules/app/modules/plugin', 'main', 'app'),
                ],
            },
        });

        const appRow = screen.getByText('app').closest('[role="listitem"]');
        if (!(appRow instanceof HTMLElement)) {
            throw new Error('Expected app repository row.');
        }
        fireEvent.click(within(appRow).getByRole('button', { name: /app/ }));

        expect(onShowRepositoryList).toHaveBeenCalledWith('app');

        rerender(
            <RepositoryNavigator
                repositories={{
                    status: 'ready',
                    data: [
                        repositorySummary('workspace', '/workspace'),
                        repositorySummary('app', '/workspace/modules/app', 'main', 'workspace'),
                        repositorySummary('plugin', '/workspace/modules/app/modules/plugin', 'main', 'app'),
                    ],
                }}
                activeContextId={{ status: 'ready', data: undefined }}
                listContextId={{ status: 'ready', data: 'app' }}
                title="Repositories"
                onNavigate={() => undefined}
                onShowRepositoryList={onShowRepositoryList}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        expect(screen.getByLabelText('Repository location')).toHaveTextContent('app');
        expect(screen.getByText('1 repository')).toBeInTheDocument();
        expect(screen.getByText('plugin')).toBeInTheDocument();
        expect(screen.queryByText('/workspace/modules/app')).not.toBeInTheDocument();
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
                listContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onShowRepositoryList={() => undefined}
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
                listContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onShowRepositoryList={() => undefined}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'nested repositories' } });

        expect(screen.getByText('platform')).toBeInTheDocument();
        expect(screen.queryByText('tools')).not.toBeInTheDocument();
    });

    it('emits navigate and open-in-new-window actions from repository rows', () => {
        const onNavigate = vi.fn<(contextId: string) => void>();
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

    it('returns from repository detail to the parent repository list', () => {
        const onShowRepositoryList = vi.fn<(contextId: string | undefined) => void>();

        renderNavigator({
            activeContextId: { status: 'ready', data: 'plugin' },
            onShowRepositoryList,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('workspace', '/workspace'),
                    repositorySummary('app', '/workspace/modules/app', 'main', 'workspace'),
                    repositorySummary('plugin', '/workspace/modules/app/modules/plugin', 'main', 'app'),
                ],
            },
        });

        expect(screen.getByText('Repository content')).toBeInTheDocument();
        expect(screen.getByText('plugin')).toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back to repositories' }));

        expect(onShowRepositoryList).toHaveBeenCalledWith('app');
    });

    it('can move from an active repository detail to its discovered child repository list', () => {
        const onShowRepositoryList = vi.fn<(contextId: string | undefined) => void>();
        const { rerender } = renderNavigator({
            activeContextId: { status: 'ready', data: 'platform' },
            onShowRepositoryList,
            repositories: {
                status: 'ready',
                data: [
                    repositorySummary('platform', '/workspace/platform'),
                    repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                ],
            },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Show nested repositories' }));

        expect(onShowRepositoryList).toHaveBeenCalledWith('platform');

        rerender(
            <RepositoryNavigator
                repositories={{
                    status: 'ready',
                    data: [
                        repositorySummary('platform', '/workspace/platform'),
                        repositorySummary('api', '/workspace/platform/modules/api', 'main', 'platform'),
                    ],
                }}
                activeContextId={{ status: 'ready', data: undefined }}
                listContextId={{ status: 'ready', data: 'platform' }}
                title="Repositories"
                onNavigate={() => undefined}
                onShowRepositoryList={() => undefined}
                onOpenInNewWindow={() => undefined}
            >
                <span>Repository content</span>
            </RepositoryNavigator>,
        );

        expect(screen.getByLabelText('Repository location')).toHaveTextContent('platform');
        expect(screen.getByText('1 repository')).toBeInTheDocument();
        expect(screen.getByText('api')).toBeInTheDocument();
        expect(screen.queryByText('Repository content')).not.toBeInTheDocument();
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
                listContextId={{ status: 'ready', data: undefined }}
                title="Repositories"
                onNavigate={() => undefined}
                onShowRepositoryList={() => undefined}
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
    readonly listContextId?: Resource<string | undefined>;
    readonly onNavigate?: (contextId: string) => void;
    readonly onShowRepositoryList?: (contextId: string | undefined) => void;
    readonly onOpenInNewWindow?: (contextId: string) => void;
}

function renderNavigator({
    repositories = { status: 'ready', data: repositorySummaries },
    activeContextId = { status: 'ready', data: undefined },
    listContextId = { status: 'ready', data: undefined },
    onNavigate = () => undefined,
    onShowRepositoryList = () => undefined,
    onOpenInNewWindow = () => undefined,
}: RenderNavigatorOptions = {}) {
    return render(
        <RepositoryNavigator
            repositories={repositories}
            activeContextId={activeContextId}
            listContextId={listContextId}
            title="Repositories"
            onNavigate={onNavigate}
            onShowRepositoryList={onShowRepositoryList}
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
