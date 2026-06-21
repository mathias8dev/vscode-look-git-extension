import * as path from 'path';
import * as vscode from 'vscode';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import type { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

export interface ActiveRepositoryState {
    readonly context: RepoContext | undefined;
}

export interface ActiveRepositoryAccessor {
    readonly currentContext: RepoContext | undefined;
}

export class ActiveRepositoryRegistry implements ActiveRepositoryAccessor, vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<ActiveRepositoryState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private context: RepoContext | undefined;

    constructor(
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

    get currentContext(): RepoContext | undefined {
        return this.context;
    }

    setActiveRepository(cwd: string | undefined): void {
        if (!cwd) {
            this.update(undefined);
            return;
        }

        const normalizedCwd = path.normalize(cwd);
        if (this.context?.cwd === normalizedCwd) {
            return;
        }

        this.update(createRepoContext(normalizedCwd));
    }

    async registerCurrentRuntimeContext(registry: RepositoryRegistry): Promise<void> {
        if (!this.context) { return; }

        const [repository, worktrees] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(this.context),
            this.runtimeRepositoryFactory.createWorktrees(this.context),
        ]);
        registry.unregisterRepositoryTree(repository.repoId);
        registry.replaceRepository(repository, worktrees);
        await this.registerSubmoduleRuntimeContexts(registry, this.context, await repository.listSubmodules());
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
    }

    private update(context: RepoContext | undefined): void {
        this.context = context;
        this.onDidChangeEmitter.fire({ context });
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

export function createRepoContext(cwd: string): RepoContext {
    return {
        id: stableRepoContextId(cwd),
        cwd,
        kind: RepoKind.Main,
        label: path.basename(cwd) || cwd,
    };
}

function createSubmoduleRepoContext(cwd: string, parentId: string): RepoContext {
    return {
        id: stableRepoContextId(cwd),
        cwd,
        kind: RepoKind.Submodule,
        parentId,
        label: path.basename(cwd) || cwd,
    };
}
