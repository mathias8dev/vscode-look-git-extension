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
    readonly onNavigate: (contextId: string) => void;
    readonly onBack: () => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

export function RepositoryNavigator({
    repositories,
    activeContextId,
    title,
    children,
    onNavigate,
    onBack,
    onOpenInNewWindow,
}: RepositoryNavigatorProps) {
    const [query, setQuery] = useState('');
    const readyRepositories = useMemo(
        () => repositories.status === 'ready' ? repositories.data : [],
        [repositories],
    );
    const normalizedQuery = query.trim().toLowerCase();
    const filteredRepositories = useMemo(() => {
        if (!normalizedQuery) { return readyRepositories; }
        return readyRepositories.filter((repository) => repositoryMatches(repository, normalizedQuery));
    }, [normalizedQuery, readyRepositories]);

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
        return (
            <>
                <div className="repository-navigator-detail-header">
                    <IconButton icon="arrow-left" title="Back to repositories" onClick={onBack} />
                    <div className="repository-navigator-detail-text">
                        <span className="repository-navigator-detail-label">{title}</span>
                        <strong>{activeRepository.context.label}</strong>
                    </div>
                </div>
                <div className="repository-navigator-detail-content">
                    {children}
                </div>
            </>
        );
    }

    return (
        <section className="repository-navigator repository-navigator-enter" aria-label={title}>
            <div className="repository-navigator-header">
                <div>
                    <h2>{title}</h2>
                    <span>{readyRepositories.length} repositories</span>
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
    readonly onNavigate: (contextId: string) => void;
    readonly onOpenInNewWindow: (contextId: string) => void;
}

function RepositoryRow({ repository, onNavigate, onOpenInNewWindow }: RepositoryRowProps) {
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
                    onClick={() => {
                        onNavigate(repository.context.id);
                    }}
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

function repositoryMatches(repository: RepositorySummary, query: string): boolean {
    return repositorySearchText(repository).includes(query);
}

function repositorySearchText(repository: RepositorySummary): string {
    return [
        repository.context.label,
        repository.context.cwd,
        repository.branch ?? 'HEAD',
        repository.upstream ?? '',
        repository.hasRemote ? 'remote' : 'local',
        repository.branchCount > 0 ? `${repository.branchCount} branches` : '',
        repository.submoduleCount > 0 ? `${repository.submoduleCount} submodules` : '',
        repository.worktreeCount > 0 ? `${repository.worktreeCount} worktrees` : '',
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
