import * as path from 'path';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { RepoContext } from '@core/git/domain/repo-context';
import { toRepositoryLocator, toWorktreeLocator } from '@extension/mapping/to-protocol';
import type { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

export interface RuntimeTargets {
    readonly repository?: GitRepository;
    readonly worktree?: Worktree;
    readonly worktrees?: readonly Worktree[];
}

export class RuntimeRepositoryLocator {
    constructor(
        private readonly registry: RepositoryRegistry,
        private readonly context: RepoContext,
    ) {}

    repository(): GitRepository {
        return this.registry.resolveRepository(toRepositoryLocator(this.context));
    }

    worktree(): Worktree {
        return this.registry.resolveWorktree(toWorktreeLocator(this.context));
    }

    worktrees(repoId = this.repository().repoId): readonly Worktree[] {
        return this.registry.worktrees(repoId);
    }

    targets(): RuntimeTargets {
        const repository = this.repository();
        return {
            repository,
            worktree: this.worktree(),
            worktrees: this.registry.worktrees(repository.repoId),
        };
    }

    submoduleRepository(submodulePath: string): GitRepository {
        const submoduleCwd = this.submoduleCwd(submodulePath);
        const submoduleId = stableRepoContextId(submoduleCwd);
        return this.registry.resolveRepository({
            repoId: submoduleId,
            kind: 'submodule',
            path: submoduleCwd,
            parentRepoId: this.context.id,
        });
    }

    submoduleWorktree(submodulePath: string): Worktree {
        const submoduleCwd = this.submoduleCwd(submodulePath);
        const submoduleId = stableRepoContextId(submoduleCwd);
        return this.registry.resolveWorktree({
            repoId: submoduleId,
            worktreeId: submoduleId,
            path: submoduleCwd,
        });
    }

    submoduleTargets(submodulePath: string): RuntimeTargets {
        const repository = this.submoduleRepository(submodulePath);
        return {
            repository,
            worktree: this.submoduleWorktree(submodulePath),
            worktrees: this.registry.worktrees(repository.repoId),
        };
    }

    targetsForWorktreePath(worktreePath: string): RuntimeTargets {
        const repository = this.repository();
        const worktrees = this.registry.worktrees(repository.repoId);
        return {
            repository,
            worktree: worktrees.find((candidate) => samePath(candidate.path, worktreePath)),
            worktrees,
        };
    }

    submoduleTargetsForWorktreePath(submodulePath: string, worktreePath: string): RuntimeTargets {
        const repository = this.submoduleRepository(submodulePath);
        const worktrees = this.registry.worktrees(repository.repoId);
        return {
            repository,
            worktree: worktrees.find((candidate) => samePath(candidate.path, worktreePath)),
            worktrees,
        };
    }

    submoduleCwd(submodulePath: string): string {
        return path.resolve(this.context.cwd, submodulePath);
    }
}

export function requireRuntimeLocator(
    registry: RepositoryRegistry | undefined,
    context: RepoContext | undefined,
): RuntimeRepositoryLocator {
    if (!registry || !context) {
        throw new Error('Runtime repository context is required for this git operation.');
    }
    return new RuntimeRepositoryLocator(registry, context);
}

function samePath(left: string, right: string): boolean {
    return path.normalize(left) === path.normalize(right);
}
