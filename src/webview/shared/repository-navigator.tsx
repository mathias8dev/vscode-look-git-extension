import { useMemo, useState, type ReactNode } from 'react';
import type { Resource } from '@protocol/shared/base';
import type { RepositorySummary } from '@protocol/shared/repo';
import { IconButton } from '@webview/shared/icon-button';
import { SearchInput } from '@webview/shared/search-input';

interface RepositoryNavigatorProps {
    readonly repositories: Resource<readonly RepositorySummary[]>;
    readonly activeContextId: Resource<string | undefined>;
    readonly title: string;
    readonly children: ReactNode;
    readonly onNavigate: (contextId: string | undefined) => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

export function RepositoryNavigator({
    repositories,
    activeContextId,
    title,
    children,
    onNavigate,
    onOpenInNewWindow,
}: RepositoryNavigatorProps) {
    const [query, setQuery] = useState('');
    const [collapsedRepositoryIds, setCollapsedRepositoryIds] = useState<readonly string[]>([]);
    const readyRepositories = useMemo(
        () => repositories.status === 'ready' ? repositories.data : [],
        [repositories],
    );
    const navigation = useMemo(() => repositoryNavigationModel(readyRepositories), [readyRepositories]);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredRepositories = useMemo(() => {
        if (!normalizedQuery) { return navigation.repositories; }
        return navigation.repositories.filter((repository) =>
            repositoryMatches(repository, normalizedQuery, navigation.childCounts.get(repository.context.id) ?? 0));
    }, [navigation.childCounts, navigation.repositories, normalizedQuery]);

    if (repositories.status === 'loading' || activeContextId.status === 'loading') {
        return <RepositoryNavigatorState icon="loading codicon-modifier-spin" title="Loading repositories" detail="Scanning workspace repositories..." />;
    }

    if (repositories.status === 'error') {
        return <RepositoryNavigatorState icon="error" title="Could not load repositories" detail={repositories.error.message} />;
    }

    if (activeContextId.status === 'error') {
        return <RepositoryNavigatorState icon="error" title="Could not select repository" detail={activeContextId.error.message} />;
    }

    if (readyRepositories.length <= 1) {
        return <>{children}</>;
    }

    const activeRepository = readyRepositories.find((repository) => repository.context.id === activeContextId.data);
    if (activeRepository) {
        const childRepositories = readyRepositories.filter((repository) => repository.context.parentId === activeRepository.context.id);
        const canNavigateBack = Boolean(activeRepository.context.parentId) || navigation.repositories.length > 1;
        const childrenCollapsed = collapsedRepositoryIds.includes(activeRepository.context.id);
        const childListId = `repository-children-${activeRepository.context.id}`;
        return (
            <section className="repository-navigator repository-navigator-detail repository-navigator-enter" aria-label={title}>
                {canNavigateBack ? (
                    <div className="repository-navigator-detail-header">
                        <IconButton
                            icon="arrow-left"
                            title={activeRepository.context.parentId ? 'Back to parent repository' : 'Back to repositories'}
                            onClick={() => {
                                setQuery('');
                                onNavigate(activeRepository.context.parentId);
                            }}
                        />
                        <div className="repository-navigator-detail-text">
                            <span className="repository-navigator-detail-label">{title}</span>
                            <strong>{activeRepository.context.label}</strong>
                        </div>
                    </div>
                ) : undefined}
                {childRepositories.length > 0 ? (
                    <section className="repository-navigator-children" aria-label={`Repositories in ${activeRepository.context.label}`}>
                        <button
                            type="button"
                            className="repository-navigator-children-header"
                            aria-label={`Repositories (${childRepositories.length})`}
                            aria-expanded={!childrenCollapsed}
                            aria-controls={childListId}
                            onClick={() => setCollapsedRepositoryIds((current) => current.includes(activeRepository.context.id)
                                ? current.filter((contextId) => contextId !== activeRepository.context.id)
                                : [...current, activeRepository.context.id])}
                        >
                            <i className={`codicon codicon-chevron-${childrenCollapsed ? 'right' : 'down'}`} aria-hidden="true" />
                            <strong>Repositories</strong>
                            <span>{childRepositories.length}</span>
                        </button>
                        {!childrenCollapsed ? (
                            <div id={childListId} className="repository-navigator-list repository-navigator-child-list" role="list">
                                {childRepositories.map((repository) => (
                                    <RepositoryRow
                                        key={repository.context.id}
                                        repository={repository}
                                        childCount={navigation.childCounts.get(repository.context.id) ?? 0}
                                        onNavigate={onNavigate}
                                        onOpenInNewWindow={onOpenInNewWindow}
                                    />
                                ))}
                            </div>
                        ) : undefined}
                    </section>
                ) : undefined}
                <div className="repository-navigator-detail-content">
                    {children}
                </div>
            </section>
        );
    }

    return (
        <section className="repository-navigator repository-navigator-enter" aria-label={title}>
            <div className="repository-navigator-header">
                <div className="repository-navigator-header-main">
                    <div className="repository-navigator-location">
                        <h2>{title}</h2>
                        <RepositoryBreadcrumb
                            title={title}
                            count={navigation.repositories.length}
                        />
                    </div>
                </div>
                <SearchInput
                    className="repository-navigator-search"
                    value={query}
                    placeholder="Search repositories"
                    ariaLabel="Search repositories"
                    onChange={setQuery}
                />
            </div>
            <div className="repository-navigator-list" role="list">
                {filteredRepositories.length === 0 ? (
                    <RepositoryNavigatorState icon="search" title="No repositories match" detail="Adjust the repository filter" />
                ) : filteredRepositories.map((repository) => (
                    <RepositoryRow
                        key={repository.context.id}
                        repository={repository}
                        childCount={navigation.childCounts.get(repository.context.id) ?? 0}
                        onNavigate={onNavigate}
                        onOpenInNewWindow={onOpenInNewWindow}
                    />
                ))}
            </div>
        </section>
    );
}

interface RepositoryRowProps {
    readonly repository: RepositorySummary;
    readonly childCount: number;
    readonly onNavigate: (contextId: string | undefined) => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

function RepositoryRow({ repository, childCount, onNavigate, onOpenInNewWindow }: RepositoryRowProps) {
    const status = repositoryStatus(repository);
    return (
        <div className="repository-navigator-row" role="listitem">
            <button
                type="button"
                className="repository-navigator-row-open"
                onClick={() => onNavigate(repository.context.id)}
            >
                <span className="repository-navigator-row-icon codicon codicon-repo" aria-hidden="true" />
                <span className="repository-navigator-row-main">
                    <span className="repository-navigator-row-title">
                        <strong>{repository.context.label}</strong>
                        <span>{repository.branch ?? 'HEAD'}</span>
                    </span>
                    <span className="repository-navigator-row-path">{repository.context.cwd}</span>
                    <span className="repository-navigator-row-stats">
                        <span title="Branches"><i className="codicon codicon-git-branch" aria-hidden="true" />{repository.branchCount}</span>
                        <span title="Submodules"><i className="codicon codicon-symbol-namespace" aria-hidden="true" />{repository.submoduleCount}</span>
                        <span title="Worktrees"><i className="codicon codicon-files" aria-hidden="true" />{repository.worktreeCount}</span>
                        {childCount > 0 ? (
                            <span title="Child repositories"><i className="codicon codicon-repo" aria-hidden="true" />{childCount}</span>
                        ) : undefined}
                        <span title={repository.upstream ?? 'No upstream'}><i className="codicon codicon-cloud" aria-hidden="true" />{repository.hasRemote ? 'remote' : 'local'}</span>
                    </span>
                </span>
                <span className="repository-navigator-row-status">{status}</span>
            </button>
            <span className="repository-navigator-row-actions">
                <IconButton
                    icon="empty-window"
                    title="Open repository in new window"
                    onClick={() => {
                        onOpenInNewWindow(repository.context.id);
                    }}
                />
                <IconButton
                    icon="arrow-right"
                    title="Open repository"
                    onClick={() => onNavigate(repository.context.id)}
                />
            </span>
        </div>
    );
}

interface RepositoryNavigatorStateProps {
    readonly icon: string;
    readonly title: string;
    readonly detail: string;
}

function RepositoryNavigatorState({ icon, title, detail }: RepositoryNavigatorStateProps) {
    return (
        <div className="repository-navigator-state">
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{detail}</span>
        </div>
    );
}

function repositoryMatches(repository: RepositorySummary, query: string, childCount: number): boolean {
    return repositorySearchText(repository, childCount).includes(query);
}

interface RepositoryNavigationModel {
    readonly repositories: readonly RepositorySummary[];
    readonly childCounts: ReadonlyMap<string, number>;
}

function repositoryNavigationModel(repositories: readonly RepositorySummary[]): RepositoryNavigationModel {
    const topLevelRepositories = repositories.filter((repository) => !repository.context.parentId);
    const childCounts = repositoryChildCounts(repositories);

    return {
        repositories: topLevelRepositories,
        childCounts,
    };
}

function repositoryChildCounts(repositories: readonly RepositorySummary[]): ReadonlyMap<string, number> {
    const counts = new Map<string, number>();
    for (const repository of repositories) {
        const parentId = repository.context.parentId;
        if (parentId) {
            counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
        }
    }
    return counts;
}

interface RepositoryBreadcrumbProps {
    readonly title: string;
    readonly count: number;
}

function RepositoryBreadcrumb({ title, count }: RepositoryBreadcrumbProps) {
    return (
        <div className="repository-navigator-breadcrumb" aria-label="Repository location">
            <span>{title}</span>
            <span className="repository-navigator-breadcrumb-count">
                {repositoryCountLabel(count)}
            </span>
        </div>
    );
}

function repositoryCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'repository' : 'repositories'}`;
}

function repositorySearchText(repository: RepositorySummary, childCount: number): string {
    return [
        repository.context.label,
        repository.context.cwd,
        repository.branch ?? 'HEAD',
        repository.upstream ?? '',
        repository.hasRemote ? 'remote' : 'local',
        repository.branchCount > 0 ? `${repository.branchCount} branches` : '',
        repository.submoduleCount > 0 ? `${repository.submoduleCount} submodules` : '',
        repository.worktreeCount > 0 ? `${repository.worktreeCount} worktrees` : '',
        childCount > 0 ? `${childCount} child repositories` : '',
        repositoryStatus(repository),
    ].join(' ').toLowerCase();
}

function repositoryStatus(repository: RepositorySummary): string {
    const changed = repository.stagedCount + repository.unstagedCount;
    if (repository.conflictCount > 0) {
        return `${repository.conflictCount} conflict${repository.conflictCount === 1 ? '' : 's'}`;
    }
    if (changed > 0) {
        const staged = repository.stagedCount > 0 ? `${repository.stagedCount} staged` : undefined;
        const unstaged = repository.unstagedCount > 0 ? `${repository.unstagedCount} changed` : undefined;
        return [staged, unstaged].filter(Boolean).join(' · ');
    }
    return 'clean';
}
