import type { GitRepository } from '@application/ports/git-topology';
import { settleOptional } from '@core/shared/async';
import type { GitGraphCommit } from '@core/git/domain/GitCommit';
import type { GitBranch, GitTag } from '@core/git/domain/GitStatus';
import type { GitSubmodule, GitWorktree } from '@core/git/domain/GitWorktree';
import { getReachableCommitHashes } from '@application/usecases/commits/get-reachable-commit-hashes';

export interface GraphDataFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly path?: string;
    readonly branches?: readonly string[];
}

export interface GraphDataPage {
    readonly offset: number;
    readonly limit: number;
}

export interface GraphWorktreeWip {
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly staged: number;
    readonly unstaged: number;
    readonly untracked: number;
    readonly conflicts: number;
}

export interface GraphDataWarning {
    readonly operation: string;
    readonly error: unknown;
}

export interface GraphSubmoduleRepository {
    readonly path: string;
    readonly status: GitSubmodule['status'];
    readonly branches: readonly GitBranch[];
    readonly worktrees: readonly GitWorktree[];
}

export interface GraphSubmoduleRepositoriesResult {
    readonly submodules: readonly GraphSubmoduleRepository[];
    readonly warnings: readonly GraphDataWarning[];
}

export interface GraphDataResult {
    readonly branches: readonly GitBranch[];
    readonly tags: readonly GitTag[];
    readonly commits: readonly GitGraphCommit[];
    readonly currentBranchCommitHashes: readonly string[];
    readonly currentBranch: string;
    readonly currentUser: string;
    readonly hasMore: boolean;
    readonly loadedCount: number;
    readonly totalCount: number;
    readonly hasRemotes: boolean;
    readonly worktrees: readonly GitWorktree[];
    readonly worktreeWips: readonly GraphWorktreeWip[];
    readonly submodules: readonly GraphSubmoduleRepository[];
    readonly warnings: readonly GraphDataWarning[];
}

export interface GraphDataOptions {
    readonly includeSubmoduleRepositories?: boolean;
    readonly resolveWorktreeWips?: (worktrees: readonly GitWorktree[], signal?: AbortSignal) => Promise<readonly GraphWorktreeWip[]>;
    readonly resolveSubmoduleRepositories?: (submodules: readonly GitSubmodule[], signal?: AbortSignal) => Promise<GraphSubmoduleRepositoriesResult>;
}

export class GetGraphDataUseCase {
    async execute(
        repo: GitRepository,
        filters: GraphDataFilters,
        page: GraphDataPage,
        signal?: AbortSignal,
        options: GraphDataOptions = {},
    ): Promise<GraphDataResult> {
        const search = filters.search?.trim();
        const usesPrefixPagination = Boolean(search);
        const maxCount = usesPrefixPagination ? page.offset + page.limit + 1 : page.limit + 1;
        const skip = usesPrefixPagination ? 0 : page.offset;
        const graphPage = await repo.getCommitGraph(
            { search, branches: filters.branches, path: filters.path, authors: filters.authors, dateFrom: filters.dateFrom, dateTo: filters.dateTo },
            { limit: maxCount, encodedCursor: skip > 0 ? String(skip) : undefined },
            signal,
        );
        const rawCommits = graphPage.items as readonly GitGraphCommit[];
        const [branches, tags, currentUser, remotesResult, worktreesResult, submodulesResult] = await Promise.all([
            repo.listBranches(signal),
            repo.listTags(signal),
            repo.getUserName(signal),
            settleOptional('graph/listRemotes', repo.listRemotes(signal)),
            settleOptional('graph/listWorktrees', repo.listWorktrees(signal)),
            settleOptional('graph/listSubmodules', repo.listSubmodules(signal)),
        ]);

        const warnings: GraphDataWarning[] = [];
        const remotes = optionalValue(remotesResult, warnings);
        const worktrees = optionalValue(worktreesResult, warnings);
        const submoduleStatuses = optionalValue(submodulesResult, warnings);

        const worktreeWips = options.resolveWorktreeWips
            ? await safeResolve('graph/worktreeWipStatus', () => options.resolveWorktreeWips!(worktrees, signal), warnings, signal)
            : [];
        const submoduleRepositories = options.includeSubmoduleRepositories === false
            ? { submodules: submoduleStatuses.map(toSubmoduleRepositorySummary), warnings: [] as GraphDataWarning[] }
            : options.resolveSubmoduleRepositories
                ? await options.resolveSubmoduleRepositories(submoduleStatuses, signal)
                : { submodules: submoduleStatuses.map(toSubmoduleRepositorySummary), warnings: [] as GraphDataWarning[] };
        warnings.push(...submoduleRepositories.warnings);

        const commits = usesPrefixPagination
            ? rawCommits.slice(page.offset, page.offset + page.limit)
            : rawCommits.slice(0, page.limit);
        const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? 'HEAD';
        const currentBranchCommitHashes = await this.getCurrentBranchCommitHashes(repo, commits, warnings, signal);
        const hasMore = rawCommits.length > (usesPrefixPagination ? page.offset + page.limit : page.limit);
        const loadedCount = page.offset + commits.length;

        return {
            branches,
            tags,
            commits,
            currentBranchCommitHashes,
            currentBranch,
            currentUser,
            hasMore,
            loadedCount,
            totalCount: hasMore ? loadedCount + 1 : loadedCount,
            hasRemotes: remotes.length > 0,
            worktrees,
            worktreeWips,
            submodules: submoduleRepositories.submodules,
            warnings,
        };
    }

    private async getCurrentBranchCommitHashes(
        repo: GitRepository,
        commits: readonly GitGraphCommit[],
        warnings: GraphDataWarning[],
        signal?: AbortSignal,
    ): Promise<readonly string[]> {
        try {
            const reachable = await getReachableCommitHashes(repo, commits.map((commit) => commit.hash), signal);
            return commits.map((commit) => commit.hash).filter((hash) => reachable.has(hash));
        } catch (error) {
            signal?.throwIfAborted();
            warnings.push({ operation: 'graph/currentBranchHistory', error });
            return [];
        }
    }
}

function toSubmoduleRepositorySummary(submodule: GitSubmodule): GraphSubmoduleRepository {
    return {
        path: submodule.path,
        status: submodule.status,
        branches: [],
        worktrees: [],
    };
}


function optionalValue<T>(
    result: { readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown },
    warnings: GraphDataWarning[],
): readonly T[] {
    if (result.status === 'fulfilled') { return result.value; }
    warnings.push({ operation: result.operation, error: result.reason });
    return [];
}

async function safeResolve<T>(
    operation: string,
    fn: () => Promise<readonly T[]>,
    warnings: GraphDataWarning[],
    signal?: AbortSignal,
): Promise<readonly T[]> {
    try {
        return await fn();
    } catch (error) {
        signal?.throwIfAborted();
        warnings.push({ operation, error });
        return [];
    }
}
