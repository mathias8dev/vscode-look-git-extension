import type { GitRepository } from '../../application/ports/git-repository';
import type { GitExecutionContext, RepositoryKind } from '../../application/ports/git-runtime';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';

export async function createGitExecutionContext(
    repository: GitRepository,
    context: RepoContext,
): Promise<GitExecutionContext> {
    return {
        cwd: repository.cwd,
        gitDir: await repository.getGitDir(),
        repositoryId: context.kind === RepoKind.Worktree ? context.parentId ?? context.id : context.id,
        worktreeId: context.id,
        kind: toExecutionRepositoryKind(context.kind),
        parentRepositoryId: context.parentId,
    };
}

function toExecutionRepositoryKind(kind: RepoKind): RepositoryKind {
    switch (kind) {
        case RepoKind.Submodule:
            return 'submodule';
        case RepoKind.Main:
        case RepoKind.Worktree:
            return 'main';
    }
}
