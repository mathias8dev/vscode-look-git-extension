import type { GitRepository } from '../../ports/git-repository';
import type { GitGraphCommit } from '../../../core/git/domain/GitCommit';
import type { GitBranch, GitTag } from '../../../core/git/domain/GitStatus';
import type { GitWorktree } from '../../../core/git/domain/GitWorktree';
import { summarizePorcelainStatus } from '../../../core/parsing/parseStatus';

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
    readonly warnings: readonly GraphDataWarning[];
}

export class GetGraphDataUseCase {
    async execute(
        repo: GitRepository,
        filters: GraphDataFilters,
        page: GraphDataPage,
        signal?: AbortSignal,
    ): Promise<GraphDataResult> {
        const maxCount = page.offset + page.limit + 1;
        const [rawCommits, branches, tags, currentUser, remotesResult, worktreesResult] = await Promise.all([
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
        ]);

        const warnings: GraphDataWarning[] = [];
        const remotes = optionalValue(remotesResult, warnings);
        const worktrees = optionalValue(worktreesResult, warnings);
        const worktreeWips = await this.getWorktreeWips(repo, worktrees, warnings, signal);

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
            warnings,
        };
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
