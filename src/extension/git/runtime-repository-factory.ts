import * as path from 'path';
import type { GitStatus } from '@core/git/domain/GitStatus';
import type { GitWorktree } from '@core/git/domain/GitWorktree';
import { RepoKind, type RepoContext } from '@core/git/domain/RepoContext';
import type { GitRuntime, RepositoryKind } from '@application/ports/git-runtime';
import { HybridGitRuntime } from '@extension/git/hybrid-git-runtime';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';
import { currentBranchNameOrUndefined } from '@extension/git/current-branch';

export class RuntimeRepositoryFactory {
    constructor(private readonly runtime: GitRuntime = new HybridGitRuntime()) {}

    createRepository(context: RepoContext): RuntimeGitRepository {
        return new RuntimeGitRepository({
            repoId: repositoryIdFor(context),
            cwd: context.cwd,
            gitDir: defaultGitDir(context.cwd),
            kind: repositoryKindFor(context),
            label: context.label,
            parentRepositoryId: context.parentId,
        }, this.runtime);
    }

    async createMainWorktree(context: RepoContext): Promise<RuntimeWorktree> {
        const repository = this.createRepository(context);
        const baseWorktree = this.createWorktree({
            context,
            path: context.cwd,
            gitDir: repository.gitDir,
            head: 'HEAD',
            branch: undefined,
            isMain: context.kind !== RepoKind.Worktree,
        });
        const [head, currentBranch, status] = await Promise.all([
            repository.resolveRef('HEAD'),
            currentBranchNameOrUndefined(repository),
            baseWorktree.getStatus(),
        ]);

        return new RuntimeWorktree({
            repoId: repositoryIdFor(context),
            worktreeId: context.id,
            path: context.cwd,
            gitDir: repository.gitDir,
            repositoryKind: repositoryKindFor(context),
            parentRepositoryId: context.parentId,
            isMain: context.kind !== RepoKind.Worktree,
            head,
            branch: currentBranch === 'HEAD' ? undefined : currentBranch,
            dirty: isDirty(status),
        }, this.runtime);
    }

    async createWorktrees(context: RepoContext): Promise<readonly RuntimeWorktree[]> {
        const repository = this.createRepository(context);
        const mainWorktree = await this.createMainWorktree(context);
        const worktrees = await repository.listWorktrees();
        const linkedWorktrees = worktrees.filter((worktree) => path.normalize(worktree.path) !== path.normalize(context.cwd));
        const runtimeWorktrees = await Promise.all(linkedWorktrees.map((worktree) => this.createLinkedWorktree(context, worktree)));
        return [mainWorktree, ...runtimeWorktrees];
    }

    private async createLinkedWorktree(context: RepoContext, worktree: GitWorktree): Promise<RuntimeWorktree> {
        const runtimeWorktree = this.createWorktree({
            context,
            path: worktree.path,
            gitDir: defaultGitDir(worktree.path),
            head: worktree.head,
            branch: worktree.branch,
            isMain: worktree.isMain,
        });
        const status = await runtimeWorktree.getStatus();
        return this.createWorktree({
            context,
            path: worktree.path,
            gitDir: defaultGitDir(worktree.path),
            head: worktree.head,
            branch: worktree.branch,
            isMain: worktree.isMain,
            dirty: isDirty(status),
        });
    }

    private createWorktree(input: {
        readonly context: RepoContext;
        readonly path: string;
        readonly gitDir: string;
        readonly head: string;
        readonly branch: string | undefined;
        readonly isMain: boolean;
        readonly dirty?: boolean;
    }): RuntimeWorktree {
        return new RuntimeWorktree({
            repoId: repositoryIdFor(input.context),
            worktreeId: input.path === input.context.cwd ? input.context.id : stableRepoContextId(input.path),
            path: input.path,
            gitDir: input.gitDir,
            repositoryKind: repositoryKindFor(input.context),
            parentRepositoryId: input.context.parentId,
            isMain: input.isMain,
            head: input.head,
            branch: input.branch,
            dirty: input.dirty ?? false,
        }, this.runtime);
    }
}

function repositoryIdFor(context: RepoContext): string {
    return context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id;
}

function repositoryKindFor(context: RepoContext): RepositoryKind {
    return context.kind === RepoKind.Submodule ? 'submodule' : 'main';
}

function defaultGitDir(cwd: string): string {
    return path.join(cwd, '.git');
}

function isDirty(status: GitStatus): boolean {
    return status.staged.length > 0 || status.unstaged.length > 0 || status.conflicts.length > 0;
}
