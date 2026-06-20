import type { GitRepository, Worktree } from '../../application/ports/git-topology';
import type { RepositoryLocator, WorktreeLocator } from '../../protocol/shared/repo';

export class RepositoryRegistry {
    private readonly repositoriesById = new Map<string, GitRepository>();
    private readonly worktreesById = new Map<string, Worktree>();
    private readonly worktreeIdsByRepositoryId = new Map<string, Set<string>>();

    registerRepository(repository: GitRepository): void {
        this.repositoriesById.set(repository.repoId, repository);
    }

    registerWorktree(worktree: Worktree): void {
        this.worktreesById.set(worktree.worktreeId, worktree);
        const worktreeIds = this.worktreeIdsByRepositoryId.get(worktree.repoId) ?? new Set<string>();
        worktreeIds.add(worktree.worktreeId);
        this.worktreeIdsByRepositoryId.set(worktree.repoId, worktreeIds);
    }

    resolveRepository(locator: RepositoryLocator): GitRepository {
        const repository = this.repositoriesById.get(locator.repoId);
        if (!repository) {
            throw new RepositoryResolutionError(`Repository "${locator.repoId}" is not registered.`);
        }
        if (repository.kind !== locator.kind) {
            throw new RepositoryResolutionError(`Repository "${locator.repoId}" kind mismatch.`);
        }
        return repository;
    }

    resolveWorktree(locator: WorktreeLocator): Worktree {
        const worktree = this.worktreesById.get(locator.worktreeId);
        if (!worktree) {
            throw new RepositoryResolutionError(`Worktree "${locator.worktreeId}" is not registered.`);
        }
        if (worktree.repoId !== locator.repoId) {
            throw new RepositoryResolutionError(`Worktree "${locator.worktreeId}" does not belong to repository "${locator.repoId}".`);
        }
        return worktree;
    }

    repositories(): readonly GitRepository[] {
        return [...this.repositoriesById.values()];
    }

    worktrees(repositoryId: string): readonly Worktree[] {
        const ids = this.worktreeIdsByRepositoryId.get(repositoryId);
        if (!ids) { return []; }
        return [...ids].map((id) => this.worktreesById.get(id)).filter(isWorktree);
    }

    unregisterRepository(repositoryId: string): void {
        this.repositoriesById.delete(repositoryId);
        const worktreeIds = this.worktreeIdsByRepositoryId.get(repositoryId);
        if (worktreeIds) {
            for (const worktreeId of worktreeIds) {
                this.worktreesById.delete(worktreeId);
            }
        }
        this.worktreeIdsByRepositoryId.delete(repositoryId);
    }
}

export class RepositoryResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RepositoryResolutionError';
    }
}

function isWorktree(value: Worktree | undefined): value is Worktree {
    return value !== undefined;
}
