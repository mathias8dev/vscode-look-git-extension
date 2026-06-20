import * as path from 'path';
import type { GitRepository as LegacyGitRepository } from '../../application/ports/git-repository';
import type { GitStatus } from '../../core/git/domain/GitStatus';
import type { GitWorktree } from '../../core/git/domain/GitWorktree';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';
import type { GitRuntime, RepositoryKind } from '../../application/ports/git-runtime';
import { HybridGitRuntime } from './hybrid-git-runtime';
import { RuntimeGitRepository } from './runtime-git-repository';
import { RuntimeWorktree } from './runtime-worktree';
import { stableRepoContextId } from '../repositories/repo-context-id';

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

    async createWorktrees(repository: LegacyGitRepository, context: RepoContext): Promise<readonly RuntimeWorktree[]> {
        const mainWorktree = await this.createMainWorktree(repository, context);
        const worktrees = await repository.listWorktrees();
        const linkedWorktrees = worktrees.filter((worktree) => path.normalize(worktree.path) !== path.normalize(repository.cwd));
        const runtimeWorktrees = await Promise.all(linkedWorktrees.map((worktree) => this.createLinkedWorktree(repository, context, worktree)));
        return [mainWorktree, ...runtimeWorktrees];
    }

    private async createLinkedWorktree(repository: LegacyGitRepository, context: RepoContext, worktree: GitWorktree): Promise<RuntimeWorktree> {
        const [gitDir, rawStatus] = await Promise.all([
            repository.exec(['--no-optional-locks', '-C', worktree.path, 'rev-parse', '--git-dir']),
            repository.execRaw(['--no-optional-locks', '-C', worktree.path, 'status', '--porcelain', '-z', '--untracked-files=all']),
        ]);

        return new RuntimeWorktree({
            repoId: repositoryIdFor(context),
            worktreeId: stableRepoContextId(worktree.path),
            path: worktree.path,
            gitDir,
            repositoryKind: repositoryKindFor(context),
            parentRepositoryId: context.parentId,
            isMain: worktree.isMain,
            head: worktree.head,
            branch: worktree.branch,
            dirty: rawStatus.length > 0,
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
