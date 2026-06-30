import * as path from 'path';
import type { RepoContext } from '@core/git/domain/repo-context';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { createSubmoduleRepoContext } from '@extension/repositories/repo-context-factory';
import type { RepositoryRegistry } from '@extension/repositories/repository-registry';

export class RepositoryRuntimeRegistrar {
    constructor(
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

    async refreshWorktrees(registry: RepositoryRegistry, context: RepoContext): Promise<void> {
        const worktrees = await this.runtimeRepositoryFactory.createWorktrees(context);
        registry.replaceWorktrees(context.id, worktrees);
    }

    async registerContext(registry: RepositoryRegistry, context: RepoContext): Promise<void> {
        const [repository, worktrees] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(context),
            this.runtimeRepositoryFactory.createWorktrees(context),
        ]);
        registry.unregisterRepositoryTree(repository.repoId);
        registry.replaceRepository(repository, worktrees);
        await this.registerSubmoduleRuntimeContexts(registry, context, await repository.listSubmodules());
    }

    private async registerSubmoduleRuntimeContexts(
        registry: RepositoryRegistry,
        parentContext: RepoContext,
        submodules: readonly GitSubmodule[],
    ): Promise<void> {
        for (const submodule of submodules) {
            if (submodule.status === '-') { continue; }
            await this.registerSubmoduleRuntimeContext(registry, parentContext, submodule);
        }
    }

    private async registerSubmoduleRuntimeContext(
        registry: RepositoryRegistry,
        parentContext: RepoContext,
        submodule: GitSubmodule,
    ): Promise<void> {
        const submoduleCwd = path.resolve(parentContext.cwd, submodule.path);
        const context = createSubmoduleRepoContext(submoduleCwd, parentContext.id);
        const [runtimeRepository, worktrees] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(context),
            this.runtimeRepositoryFactory.createWorktrees(context),
        ]);
        registry.replaceRepository(runtimeRepository, worktrees);
    }
}
