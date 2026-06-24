import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Resource } from '@protocol/shared/base';
import type { RepositorySummary } from '@protocol/shared/repo';
import { RepositoryNavigator } from '@webview/shared/repository-navigator';

function RepositoryNavigatorScenario() {
    const [activeContextId, setActiveContextId] = useState<string | undefined>(undefined);
    const repositories = {
        status: 'ready',
        data: repositorySummaries,
    } satisfies Resource<readonly RepositorySummary[]>;

    return (
        <div className="storybook-app-frame">
            <RepositoryNavigator
                repositories={repositories}
                activeContextId={{ status: 'ready', data: activeContextId }}
                title="Repositories"
                onNavigate={setActiveContextId}
                onBack={() => setActiveContextId(undefined)}
                onOpenInNewWindow={setActiveContextId}
            >
                <section className="storybook-navigator-content">
                    <h2>{repositorySummaries.find((repository) => repository.context.id === activeContextId)?.context.label}</h2>
                    <span>Selected repository content</span>
                </section>
            </RepositoryNavigator>
        </div>
    );
}

const meta = {
    title: 'Shared/RepositoryNavigator',
    component: RepositoryNavigatorScenario,
} satisfies Meta<typeof RepositoryNavigatorScenario>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Navigable = {} satisfies Story;

const repositorySummaries = [
    repositorySummary('look-git', '/work/look-git', 'feature/multimodule', 4, 1, 0),
    repositorySummary('api', '/work/services/api', 'main', 0, 0, 0),
    repositorySummary('desktop', '/work/apps/desktop', 'release/1.2', 0, 3, 2),
] satisfies readonly RepositorySummary[];

function repositorySummary(
    id: string,
    cwd: string,
    branch: string,
    stagedCount: number,
    unstagedCount: number,
    conflictCount: number,
): RepositorySummary {
    return {
        context: { id, cwd, kind: 'main', label: id },
        branch,
        upstream: `origin/${branch}`,
        hasRemote: true,
        branchCount: 8,
        submoduleCount: id === 'look-git' ? 2 : 0,
        worktreeCount: id === 'desktop' ? 3 : 1,
        stagedCount,
        unstagedCount,
        conflictCount,
    };
}
