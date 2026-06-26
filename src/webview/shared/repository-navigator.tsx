import { useMemo, useState, type ReactNode } from 'react';
import type { Resource } from '@protocol/shared/base';
import type { RepositorySummary } from '@protocol/shared/repo';
import { IconButton } from '@webview/shared/icon-button';
import { SearchInput } from '@webview/shared/search-input';

interface RepositoryNavigatorProps {
    readonly repositories: Resource<readonly RepositorySummary[]>;
    readonly activeContextId: Resource<string | undefined>;
    readonly listContextId: Resource<string | undefined>;
    readonly title: string;
    readonly children: ReactNode;
    readonly onNavigate: (contextId: string) => void;
    readonly onShowRepositoryList: (contextId: string | undefined) => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

export function RepositoryNavigator({
    repositories,
    activeContextId,
    listContextId,
    title,
    children,
    onNavigate,
    onShowRepositoryList,
    onOpenInNewWindow,
}: RepositoryNavigatorProps) {
    const [query, setQuery] = useState('');
    const readyRepositories = useMemo(
        () => repositories.status === 'ready' ? repositories.data : [],
        [repositories],
    );
    const navigation = useMemo(
        () => repositoryNavigationModel(readyRepositories, listContextId.status === 'ready' ? listContextId.data : undefined),
        [listContextId, readyRepositories],
    );
    const normalizedQuery = query.trim().toLowerCase();
    const filteredRepositories = useMemo(() => {
        if (!normalizedQuery) { return navigation.repositories; }
        return navigation.repositories.filter((repository) =>
            repositoryMatches(repository, normalizedQuery, navigation.childCounts.get(repository.context.id) ?? 0));
    }, [navigation.childCounts, navigation.repositories, normalizedQuery]);

    if (repositories.status === 'loading' || activeContextId.status === 'loading' || listContextId.status === 'loading') {
        return <RepositoryNavigatorState icon="loading codicon-modifier-spin" title="Loading repositories" detail="Scanning workspace repositories..." />;
    }

    if (repositories.status === 'error') {
        return <RepositoryNavigatorState icon="error" title="Could not load repositories" detail={repositories.error.message} />;
    }

    if (activeContextId.status === 'error') {
        return <RepositoryNavigatorState icon="error" title="Could not select repository" detail={activeContextId.error.message} />;
    }

    if (listContextId.status === 'error') {
        return <RepositoryNavigatorState icon="error" title="Could not show repositories" detail={listContextId.error.message} />;
    }

    if (readyRepositories.length <= 1) {
        return <>{children}</>;
    }

    const activeRepository = readyRepositories.find((repository) => repository.context.id === activeContextId.data);
    if (activeRepository) {
        const activeChildCount = navigation.childCounts.get(activeRepository.context.id) ?? 0;
        return (
            <section className="repository-navigator repository-navigator-detail repository-navigator-enter" aria-label={title}>
                <div className="repository-navigator-detail-header">
                    <IconButton
                        icon="arrow-left"
                        title="Back to repositories"
                        onClick={() => {
                            setQuery('');
                            onShowRepositoryList(activeRepository.context.parentId);
                        }}
                    />
                    <div className="repository-navigator-detail-text">
                        <span className="repository-navigator-detail-label">{title}</span>
                        <strong>{activeRepository.context.label}</strong>
                    </div>
                    {activeChildCount > 0 ? (
                        <IconButton
                            icon="arrow-right"
                            title="Show nested repositories"
                            onClick={() => {
                                setQuery('');
                                onShowRepositoryList(activeRepository.context.id);
                            }}
                        />
                    ) : undefined}
                </div>
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
                    {navigation.canGoBack ? (
                        <IconButton
                            icon="arrow-left"
                            title="Back to parent folder"
                            onClick={() => {
                                setQuery('');
                                onShowRepositoryList(navigation.backParentId);
                            }}
                        />
                    ) : undefined}
                    <div className="repository-navigator-location">
                        <h2>{title}</h2>
                        <RepositoryBreadcrumb
                            title={title}
                            ancestors={navigation.ancestorRepositories}
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
                        onShowRepositoryList={(contextId) => {
                            setQuery('');
                            onShowRepositoryList(contextId);
                        }}
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
    readonly onNavigate: (contextId: string) => void;
    readonly onShowRepositoryList: (contextId: string) => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

function RepositoryRow({ repository, childCount, onNavigate, onShowRepositoryList, onOpenInNewWindow }: RepositoryRowProps) {
    const status = repositoryStatus(repository);
    const opensNestedRepositories = childCount > 0;
    return (
        <div className="repository-navigator-row" role="listitem">
            <button
                type="button"
                className="repository-navigator-row-open"
                onClick={() => {
                    if (opensNestedRepositories) {
                        onShowRepositoryList(repository.context.id);
                        return;
                    }
                    onNavigate(repository.context.id);
                }}
            >
                <span className={`repository-navigator-row-icon codicon codicon-${opensNestedRepositories ? 'folder' : 'repo'}`} aria-hidden="true" />
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
                            <span title="Nested repositories"><i className="codicon codicon-repo" aria-hidden="true" />{childCount}</span>
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
    readonly parentRepository: RepositorySummary | undefined;
    readonly ancestorRepositories: readonly RepositorySummary[];
    readonly childCounts: ReadonlyMap<string, number>;
    readonly canGoBack: boolean;
    readonly backParentId: string | undefined;
}

function repositoryNavigationModel(repositories: readonly RepositorySummary[], listParentId: string | undefined): RepositoryNavigationModel {
    const topLevelRepositories = repositories.filter((repository) => !repository.context.parentId);
    const childCounts = repositoryChildCounts(repositories);
    const validListParentId = listParentId && repositories.some((repository) => repository.context.id === listParentId)
        ? listParentId
        : undefined;
    const implicitParentId = topLevelRepositories.length === 1 && (childCounts.get(topLevelRepositories[0]?.context.id ?? '') ?? 0) > 0
        ? topLevelRepositories[0]?.context.id
        : undefined;
    const parentId = validListParentId ?? implicitParentId;
    const parentRepository = repositories.find((repository) => repository.context.id === parentId);
    const visibleRepositories = parentId
        ? repositories.filter((repository) => repository.context.parentId === parentId)
        : topLevelRepositories;
    const ancestorRepositories = parentRepository ? repositoryAncestors(repositories, parentRepository) : [];

    return {
        repositories: visibleRepositories.length > 0 ? visibleRepositories : topLevelRepositories,
        parentRepository,
        ancestorRepositories,
        childCounts,
        canGoBack: Boolean(validListParentId),
        backParentId: parentRepository?.context.parentId === implicitParentId ? undefined : parentRepository?.context.parentId,
    };
}

function repositoryAncestors(repositories: readonly RepositorySummary[], repository: RepositorySummary): readonly RepositorySummary[] {
    const byId = new Map(repositories.map((candidate) => [candidate.context.id, candidate]));
    const ancestors: RepositorySummary[] = [];
    let current: RepositorySummary | undefined = repository;
    while (current) {
        ancestors.unshift(current);
        current = current.context.parentId ? byId.get(current.context.parentId) : undefined;
    }
    return ancestors;
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
    readonly ancestors: readonly RepositorySummary[];
    readonly count: number;
}

function RepositoryBreadcrumb({ title, ancestors, count }: RepositoryBreadcrumbProps) {
    return (
        <div className="repository-navigator-breadcrumb" aria-label="Repository location">
            <span>{title}</span>
            {ancestors.map((repository) => (
                <span key={repository.context.id} className="repository-navigator-breadcrumb-segment">
                    <i className="codicon codicon-chevron-right" aria-hidden="true" />
                    <span>{repository.context.label}</span>
                </span>
            ))}
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
        childCount > 0 ? `${childCount} nested repositories` : '',
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
