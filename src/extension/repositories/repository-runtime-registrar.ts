import * as path from 'path';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { RepoContext } from '@core/git/domain/repo-context';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { createSubmoduleRepoContext } from '@extension/repositories/repo-context-factory';
import type { RepositoryRegistry } from '@extension/repositories/repository-registry';

export class RepositoryRuntimeRegistrar {
    constructor(
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

    async refreshWorktrees(registry: RepositoryRegistry, context: RepoContext, signal?: AbortSignal): Promise<void> {
        const worktrees = await this.runtimeRepositoryFactory.createWorktrees(context, signal);
        registry.replaceWorktrees(context.id, worktrees);
    }

    async registerContext(registry: RepositoryRegistry, context: RepoContext, signal?: AbortSignal): Promise<void> {
        const [repository, worktrees] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(context),
            this.runtimeRepositoryFactory.createWorktrees(context, signal),
        ]);
        const submoduleRegistrations = await this.createSubmoduleRuntimeRegistrations(
            context,
            await repository.listSubmodules(signal),
            signal,
        );
        signal?.throwIfAborted();

        registry.unregisterRepositoryTree(repository.repoId);
        registry.replaceRepository(repository, worktrees);
        for (const registration of submoduleRegistrations) {
            registry.replaceRepository(registration.repository, registration.worktrees);
        }
    }

    private async createSubmoduleRuntimeRegistrations(
        parentContext: RepoContext,
        submodules: readonly GitSubmodule[],
        signal?: AbortSignal,
    ): Promise<readonly RuntimeRegistration[]> {
        const registrations: RuntimeRegistration[] = [];
        for (const submodule of submodules) {
            if (submodule.status === '-') { continue; }
            signal?.throwIfAborted();
            registrations.push(await this.createSubmoduleRuntimeRegistration(parentContext, submodule, signal));
        }
        return registrations;
    }

    private async createSubmoduleRuntimeRegistration(
        parentContext: RepoContext,
        submodule: GitSubmodule,
        signal?: AbortSignal,
    ): Promise<RuntimeRegistration> {
        const submoduleCwd = path.resolve(parentContext.cwd, submodule.path);
        const context = createSubmoduleRepoContext(submoduleCwd, parentContext.id);
        const [repository, worktrees] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(context),
            this.runtimeRepositoryFactory.createWorktrees(context, signal),
        ]);
        return { repository, worktrees };
    }
}

interface RuntimeRegistration {
    readonly repository: GitRepository;
    readonly worktrees: readonly Worktree[];
}
