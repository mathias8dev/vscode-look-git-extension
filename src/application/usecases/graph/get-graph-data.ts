import type { GitRepository } from '../../ports/git-repository';
import type { GitGraphCommit } from '../../../core/git/domain/GitCommit';
import type { GitBranch, GitTag } from '../../../core/git/domain/GitStatus';
import type { GitSubmodule, GitWorktree } from '../../../core/git/domain/GitWorktree';
import { summarizePorcelainStatus } from '../../../core/parsing/parseStatus';
import { queryAllBranches, queryCurrentBranch } from '../../../core/queries/queryGraph';
import { queryWorktrees } from '../../../core/queries/queryWorktrees';

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
}

export class GetGraphDataUseCase {
    async execute(
        repo: GitRepository,
        filters: GraphDataFilters,
        page: GraphDataPage,
        signal?: AbortSignal,
        options: GraphDataOptions = {},
    ): Promise<GraphDataResult> {
        const maxCount = page.offset + page.limit + 1;
        const [rawCommits, branches, tags, currentUser, remotesResult, worktreesResult, submodulesResult] = await Promise.all([
            repo.getGraphLog(maxCount, filters.branches, filters.path, {
                search: filters.search,
                authors: filters.authors,
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
            }, signal),
            repo.getAllBranches(signal),
            repo.getAllTags(signal),
            repo.getUserName(signal),
            settleOptional('graph/listRemotes', repo.getRemotes(signal)),
            settleOptional('graph/listWorktrees', repo.listWorktrees(signal)),
            settleOptional('graph/listSubmodules', repo.getSubmoduleStatus(signal)),
        ]);

        const warnings: GraphDataWarning[] = [];
        const remotes = optionalValue(remotesResult, warnings);
        const worktrees = optionalValue(worktreesResult, warnings);
        const submoduleStatuses = optionalValue(submodulesResult, warnings);
        const worktreeWips = await this.getWorktreeWips(repo, worktrees, warnings, signal);
        const submoduleRepositories = options.includeSubmoduleRepositories === false
            ? { submodules: submoduleStatuses.map(toSubmoduleRepositorySummary), warnings: [] }
            : await this.getSubmoduleRepositories(repo, submoduleStatuses, signal);
        warnings.push(...submoduleRepositories.warnings);

        const commits = rawCommits.slice(page.offset, page.offset + page.limit);
        const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? 'HEAD';

        return {
            branches,
            tags,
            commits,
            currentBranch,
            currentUser,
            hasMore: rawCommits.length > page.offset + page.limit,
            loadedCount: commits.length,
            totalCount: rawCommits.length,
            hasRemotes: remotes.length > 0,
            worktrees,
            worktreeWips,
            submodules: submoduleRepositories.submodules,
            warnings,
        };
    }

    async getSubmoduleRepositories(
        repo: GitRepository,
        submodules: readonly GitSubmodule[],
        signal?: AbortSignal,
    ): Promise<GraphSubmoduleRepositoriesResult> {
        const warnings: GraphDataWarning[] = [];
        const repositories = await this.loadSubmoduleRepositories(repo, submodules, warnings, signal);
        return { submodules: repositories, warnings };
    }

    private async getWorktreeWips(
        repo: GitRepository,
        worktrees: readonly GitWorktree[],
        warnings: GraphDataWarning[],
        signal?: AbortSignal,
    ): Promise<readonly GraphWorktreeWip[]> {
        const wips = await Promise.all(worktrees.map(async (worktree): Promise<GraphWorktreeWip | undefined> => {
            try {
                const raw = await repo.execRaw(['-C', worktree.path, 'status', '--porcelain=v1', '-z', '-u'], signal);
                const counts = summarizePorcelainStatus(raw);
                const total = counts.staged + counts.unstaged + counts.untracked + counts.conflicts;
                return total > 0
                    ? { path: worktree.path, head: worktree.head, branch: worktree.branch, ...counts }
                    : undefined;
            } catch (error) {
                signal?.throwIfAborted();
                warnings.push({ operation: 'graph/worktreeWipStatus', error });
                return undefined;
            }
        }));
        return wips.filter((wip): wip is GraphWorktreeWip => wip !== undefined);
    }

    private async loadSubmoduleRepositories(
        repo: GitRepository,
        submodules: readonly GitSubmodule[],
        warnings: GraphDataWarning[],
        signal?: AbortSignal,
    ): Promise<readonly GraphSubmoduleRepository[]> {
        return mapLimited(submodules, 4, async (submodule) => {
            if (submodule.status === '-') {
                return { path: submodule.path, status: submodule.status, branches: [], worktrees: [] };
            }

            const execSubmoduleRaw = (args: readonly string[], s?: AbortSignal) => repo.execRaw(['-C', submodule.path, ...args], s);
            const execSubmodule = (args: readonly string[], s?: AbortSignal) => repo.exec(['-C', submodule.path, ...args], s);
            const [branchesResult, worktreesResult] = await Promise.all([
                settleOptional(`graph/submoduleBranches:${submodule.path}`, queryAllBranches(execSubmoduleRaw, (s) => queryCurrentBranch(execSubmodule, s), signal)),
                settleOptional(`graph/submoduleWorktrees:${submodule.path}`, queryWorktrees(execSubmoduleRaw, signal)),
            ]);

            return {
                path: submodule.path,
                status: submodule.status,
                branches: optionalValue(branchesResult, warnings),
                worktrees: optionalValue(worktreesResult, warnings),
            };
        });
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

async function mapLimited<T, R>(
    items: readonly T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
): Promise<readonly R[]> {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += limit) {
        results.push(...await Promise.all(items.slice(index, index + limit).map(mapper)));
    }
    return results;
}

async function settleOptional<T>(
    operation: string,
    promise: Promise<readonly T[]>,
): Promise<{ readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown }> {
    try {
        return { operation, status: 'fulfilled', value: await promise };
    } catch (error) {
        return { operation, status: 'rejected', reason: error };
    }
}

function optionalValue<T>(
    result: { readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown },
    warnings: GraphDataWarning[],
): readonly T[] {
    if (result.status === 'fulfilled') { return result.value; }
    warnings.push({ operation: result.operation, error: result.reason });
    return [];
}
