import type { GitRepository as LegacyGitRepository } from '../../application/ports/git-repository';
import type { GitStatus } from '../../core/git/domain/GitStatus';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';
import type { GitRuntime, RepositoryKind } from '../../application/ports/git-runtime';
import { HybridGitRuntime } from './hybrid-git-runtime';
import { RuntimeGitRepository } from './runtime-git-repository';
import { RuntimeWorktree } from './runtime-worktree';

export class RuntimeRepositoryFactory {
    constructor(private readonly runtime: GitRuntime = new HybridGitRuntime()) {}

    async createRepository(repository: LegacyGitRepository, context: RepoContext): Promise<RuntimeGitRepository> {
        return new RuntimeGitRepository({
            repoId: repositoryIdFor(context),
            cwd: repository.cwd,
            gitDir: await repository.getGitDir(),
            kind: repositoryKindFor(context),
            label: context.label,
            parentRepositoryId: context.parentId,
        }, this.runtime);
    }

    async createMainWorktree(repository: LegacyGitRepository, context: RepoContext): Promise<RuntimeWorktree> {
        const [gitDir, head, currentBranch, status] = await Promise.all([
            repository.getGitDir(),
            repository.exec(['rev-parse', 'HEAD']),
            repository.getCurrentBranch(),
            repository.getStatus(),
        ]);

        return new RuntimeWorktree({
            repoId: repositoryIdFor(context),
            worktreeId: context.id,
            path: repository.cwd,
            gitDir,
            repositoryKind: repositoryKindFor(context),
            parentRepositoryId: context.parentId,
            isMain: context.kind !== RepoKind.Worktree,
            head,
            branch: currentBranch === 'HEAD' ? undefined : currentBranch,
            dirty: isDirty(status),
        }, this.runtime);
    }
}

function repositoryIdFor(context: RepoContext): string {
    return context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id;
}

function repositoryKindFor(context: RepoContext): RepositoryKind {
    return context.kind === RepoKind.Submodule ? 'submodule' : 'main';
}

function isDirty(status: GitStatus): boolean {
    return status.staged.length > 0 || status.unstaged.length > 0 || status.conflicts.length > 0;
}
