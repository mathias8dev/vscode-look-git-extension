import type { GraphRow } from '../graphView/graphLaneAssigner';

export interface BranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
    hash: string;
    upstream?: string;
    ahead?: number;
    behind?: number;
}

export interface TagInfo {
    name: string;
    hash: string;
}

export interface FileChange {
    status: string;
    filePath: string;
    origPath?: string;
    parentHash?: string;
}

export interface GraphData {
    branches: BranchInfo[];
    tags: TagInfo[];
    rows: GraphRow[];
    maxLane: number;
    currentBranch: string;
    currentUser: string;
    hasMore: boolean;
    loadedCount: number;
    hasRemotes?: boolean;
    repositoryWebUrl?: string;
    currentBranchCommitHashes?: string[];
}

export type BranchViewMode = 'list' | 'tree';
export type FilesViewMode = 'list' | 'tree';

export interface PaneState {
    branchWidth: number;
    detailsWidth: number;
    branchViewMode: BranchViewMode;
    filesViewMode: FilesViewMode;
    showGraph: boolean;
}

export interface GraphFilterState {
    search: string;
    authors: string[];
    dateFrom: string | null;
    dateTo: string | null;
    path: string | null;
}
