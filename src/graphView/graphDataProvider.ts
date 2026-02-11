import type { GitService, BranchInfo, TagInfo, GraphCommitInfo, GitFileChange } from '../gitService';
import { assignLanes, getMaxLane } from './graphLaneAssigner';
import type { GraphRow } from './graphLaneAssigner';

export interface GraphData {
    branches: BranchInfo[];
    tags: TagInfo[];
    rows: GraphRow[];
    maxLane: number;
    currentBranch: string;
}

export class GraphDataProvider {
    constructor(private gitService: GitService) {}

    public async getGraphData(maxCount: number = 300, filterBranches?: string[]): Promise<GraphData> {
        const [branches, tags, commits, currentBranch] = await Promise.all([
            this.gitService.getAllBranches(),
            this.gitService.getAllTags(),
            this.gitService.getGraphLog(maxCount, filterBranches),
            this.gitService.getCurrentBranch(),
        ]);

        const rows = assignLanes(commits);
        const maxLane = getMaxLane(rows);

        return { branches, tags, rows, maxLane, currentBranch };
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        return this.gitService.getCommitFiles(commitHash);
    }

    public async getCommitMessage(commitHash: string): Promise<string> {
        return this.gitService.getCommitMessage(commitHash);
    }
}
