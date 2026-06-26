import type { RepoContext } from '@core/git/domain/repo-context';
import type { GitBranch } from '@core/git/domain/git-status';
import type { RepositorySummary } from '@protocol/shared/repo';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { toSerializedRepoContext } from '@extension/mapping/to-protocol';

export class RepositorySummaryService {
    constructor(
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

    async summarize(contexts: readonly RepoContext[], signal?: AbortSignal): Promise<readonly RepositorySummary[]> {
        return Promise.all(contexts.map((context) => this.summarizeContext(context, signal)));
    }

    private async summarizeContext(context: RepoContext, signal?: AbortSignal): Promise<RepositorySummary> {
        const repository = this.runtimeRepositoryFactory.createRepository(context);
        const mainWorktree = await this.runtimeRepositoryFactory.createMainWorktree(context);
        const [branches, remotes, submodules, worktrees, status] = await Promise.all([
            repository.listBranches(signal),
            repository.listRemotes(signal),
            repository.listSubmodules(signal),
            repository.listWorktrees(signal),
            mainWorktree.getStatus(signal),
        ]);
        const currentBranch = currentLocalBranch(branches);

        return {
            context: toSerializedRepoContext(context),
            branch: currentBranch?.name ?? mainWorktree.branch,
            upstream: currentBranch?.upstream,
            hasRemote: remotes.length > 0,
            branchCount: branches.filter((branch) => !branch.isRemote).length,
            submoduleCount: submodules.length,
            worktreeCount: worktrees.filter((worktree) => !worktree.isPrunable).length,
            stagedCount: status.staged.length,
            unstagedCount: status.unstaged.length,
            conflictCount: status.conflicts.length,
        };
    }
}

function currentLocalBranch(branches: readonly GitBranch[]): GitBranch | undefined {
    return branches.find((branch) => branch.isCurrent && !branch.isRemote);
}
