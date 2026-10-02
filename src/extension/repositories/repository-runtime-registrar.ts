import * as path from 'path';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { RepoContext } from '@core/git/domain/repo-context';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { createSubmoduleRepoContext } from '@extension/repositories/repo-context-factory';
import type { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { toRepositoryLocator } from '@extension/mapping/to-protocol';

export class RepositoryRuntimeRegistrar {
    constructor(
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

    async refreshContext(registry: RepositoryRegistry, context: RepoContext, signal?: AbortSignal): Promise<void> {
        const repository = registry.resolveRepository(toRepositoryLocator(context));
        const [worktrees, submodules] = await Promise.all([
            this.runtimeRepositoryFactory.createWorktrees(context, signal),
            repository.listSubmodules(signal),
        ]);
        const registrations = await this.createSubmoduleRuntimeRegistrations(context, submodules, signal, registry);
        signal?.throwIfAborted();
        if (!registry.repositories().includes(repository)) { return; }

        registry.replaceWorktrees(repository.repoId, worktrees);
        const initializedIds = new Set(registrations.map((registration) => registration.repository.repoId));
        for (const child of registry.repositories()) {
            if (child.kind === 'submodule' && child.parentRepositoryId === context.id && !initializedIds.has(child.repoId)) {
                registry.unregisterRepositoryTree(child.repoId);
            }
        }
        for (const registration of registrations) {
            registry.replaceRepository(registration.repository, registration.worktrees);
        }
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
        registry?: RepositoryRegistry,
    ): Promise<readonly RuntimeRegistration[]> {
        const registrations: RuntimeRegistration[] = [];
        const existingById = new Map(registry?.repositories().map((repository) => [repository.repoId, repository]));
        for (const submodule of submodules) {
            if (submodule.status === '-') { continue; }
            signal?.throwIfAborted();
            const context = createSubmoduleRepoContext(path.resolve(parentContext.cwd, submodule.path), parentContext.id);
            const existing = existingById.get(context.id);
            registrations.push(existing && registry
                ? { repository: existing, worktrees: registry.worktrees(existing.repoId) }
                : await this.createSubmoduleRuntimeRegistration(context, signal));
        }
        return registrations;
    }

    private async createSubmoduleRuntimeRegistration(
        context: RepoContext,
        signal?: AbortSignal,
    ): Promise<RuntimeRegistration> {
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
