import type { GitService, BranchInfo, TagInfo, GraphCommitInfo, GitFileChange, GraphLogFilters, WorktreeInfo } from '../gitService';
import { assignLanes, getMaxLane } from './graphLaneAssigner';
import type { GraphRow } from './graphLaneAssigner';
import { getRepositoryWebUrl } from '../utils/remoteUrl';

export interface GraphData {
    branches: BranchInfo[];
    tags: TagInfo[];
    rows: GraphRow[];
    maxLane: number;
    currentBranch: string;
    currentUser: string;
    hasMore: boolean;
    loadedCount: number;
    hasRemotes: boolean;
    repositoryWebUrl?: string;
    currentBranchCommitHashes?: string[];
    worktrees: WorktreeInfo[];
}

export class GraphDataProvider {
    constructor(private gitService: GitService) {}

    public async getGraphData(
        maxCount: number = 300,
        filterBranches?: string[],
        pathFilter?: string,
        filters: GraphLogFilters = {},
    ): Promise<GraphData> {
        const requestedCount = Math.max(1, maxCount);
        const logFilters = hasGraphLogFilters(filters) ? filters : undefined;
        const [branches, tags, rawCommits, currentUser, remotes, currentBranchCommitHashes, worktrees] = await Promise.all([
            this.gitService.getAllBranches(),
            this.gitService.getAllTags(),
            logFilters
                ? this.gitService.getGraphLog(requestedCount + 1, filterBranches, pathFilter, logFilters)
                : this.gitService.getGraphLog(requestedCount + 1, filterBranches, pathFilter),
            this.gitService.getUserName(),
            this.getRemotes(),
            this.getCurrentBranchCommitHashes(Math.max(requestedCount + 1, 1000)),
            (this.gitService.listWorktrees?.() ?? Promise.resolve([] as WorktreeInfo[])).catch(() => [] as WorktreeInfo[]),
        ]);

        const remoteUrl = remotes.length > 0
            ? await this.getRemoteUrl(remotes.includes('origin') ? 'origin' : remotes[0])
            : undefined;
        const repositoryWebUrl = getRepositoryWebUrl(remoteUrl);
        const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? 'HEAD';
        const primaryBranch = filterBranches?.length === 1 ? filterBranches[0] : currentBranch;
        const primaryBranchHash = branches.find((branch) => branch.name === primaryBranch)?.hash;
        const hasMore = rawCommits.length > requestedCount;
        const commits = rawCommits.slice(0, requestedCount);
        const rows = assignLanes(commits, { primaryBranch, primaryBranchHash });
        const maxLane = getMaxLane(rows);

        return {
            branches,
            tags,
            rows,
            maxLane,
            currentBranch,
            currentUser,
            hasMore,
            loadedCount: commits.length,
            hasRemotes: remotes.length > 0,
            repositoryWebUrl,
            currentBranchCommitHashes,
            worktrees,
        };
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        return this.gitService.getCommitFiles(commitHash);
    }

    public async getCommitMessage(commitHash: string): Promise<string> {
        return this.gitService.getCommitMessage(commitHash);
    }

    private async getRemotes(): Promise<string[]> {
        const service = this.gitService as GitService & { getRemotes?: () => Promise<string[]> };
        if (!service.getRemotes) {
            return [];
        }
        return service.getRemotes().catch(() => []);
    }

    private async getRemoteUrl(remote: string): Promise<string | undefined> {
        const service = this.gitService as GitService & { getRemoteUrl?: (remoteName?: string) => Promise<string | undefined> };
        if (!service.getRemoteUrl) {
            return undefined;
        }
        return service.getRemoteUrl(remote).catch(() => undefined);
    }

    private async getCurrentBranchCommitHashes(maxCount: number): Promise<string[] | undefined> {
        const service = this.gitService as GitService & { getHeadCommitHashes?: (maxCount?: number) => Promise<string[]> };
        if (!service.getHeadCommitHashes) {
            return undefined;
        }
        return service.getHeadCommitHashes(maxCount).catch(() => undefined);
    }
}

function hasGraphLogFilters(filters: GraphLogFilters): boolean {
    return Boolean(
        filters.search?.trim()
        || filters.dateFrom?.trim()
        || filters.dateTo?.trim()
        || filters.authors?.some((author) => author.trim())
    );
}
