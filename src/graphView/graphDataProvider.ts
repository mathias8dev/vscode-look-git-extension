import type { GitService, BranchInfo, TagInfo, GraphCommitInfo, GitFileChange } from '../gitService';
import { assignLanes, getMaxLane } from './graphLaneAssigner';
import type { GraphRow } from './graphLaneAssigner';

export interface GraphData {
    branches: BranchInfo[];
    tags: TagInfo[];
    rows: GraphRow[];
    maxLane: number;
    currentBranch: string;
    currentUser: string;
    hasMore: boolean;
    loadedCount: number;
}

export class GraphDataProvider {
    constructor(private gitService: GitService) {}

    public async getGraphData(maxCount: number = 300, filterBranches?: string[], pathFilter?: string): Promise<GraphData> {
        const requestedCount = Math.max(1, maxCount);
        const [branches, tags, rawCommits, currentUser] = await Promise.all([
            this.gitService.getAllBranches(),
            this.gitService.getAllTags(),
            this.gitService.getGraphLog(requestedCount + 1, filterBranches, pathFilter),
            this.gitService.getUserName(),
        ]);

        const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? 'HEAD';
        const hasMore = rawCommits.length > requestedCount;
        const commits = rawCommits.slice(0, requestedCount);
        const rows = assignLanes(commits);
        const maxLane = getMaxLane(rows);

        return { branches, tags, rows, maxLane, currentBranch, currentUser, hasMore, loadedCount: commits.length };
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        return this.gitService.getCommitFiles(commitHash);
    }

    public async getCommitMessage(commitHash: string): Promise<string> {
        return this.gitService.getCommitMessage(commitHash);
    }
}
