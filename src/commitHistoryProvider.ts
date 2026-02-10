import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from './gitService';
import { CommitItem, FileChangeItem, LoadMoreItem } from './commitItem';

export type TreeItem = CommitItem | FileChangeItem | LoadMoreItem;

export class CommitHistoryProvider implements vscode.TreeDataProvider<TreeItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private commits: GitCommitInfo[] = [];
    private pageSize: number;
    private hasMore: boolean = true;

    constructor(private gitService: GitService) {
        this.pageSize = vscode.workspace.getConfiguration('lookGit').get('maxCommits', 50);
    }

    public refresh(): void {
        this.commits = [];
        this.hasMore = true;
        this._onDidChangeTreeData.fire();
    }

    public async loadMore(): Promise<void> {
        const skip = this.commits.length;
        const newCommits = await this.gitService.getLog(this.pageSize, skip);
        this.commits.push(...newCommits);
        this.hasMore = newCommits.length === this.pageSize;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        // Expanding a commit → show its changed files
        if (element instanceof CommitItem) {
            try {
                const files = await this.gitService.getCommitFiles(element.commitInfo.hash);
                const repoRoot = this.gitService.getWorkingDirectory();
                return files.map((f) => new FileChangeItem(f, element.commitInfo.hash, repoRoot));
            } catch {
                return [];
            }
        }

        // FileChangeItem and LoadMoreItem have no children
        if (element) {
            return [];
        }

        // Root: load commits
        if (this.commits.length === 0) {
            try {
                this.commits = await this.gitService.getLog(this.pageSize, 0);
                this.hasMore = this.commits.length === this.pageSize;
            } catch {
                return [];
            }
        }

        const items: TreeItem[] = this.commits.map(
            (commit, index) => new CommitItem(commit, index === 0)
        );

        if (this.hasMore) {
            items.push(new LoadMoreItem());
        }

        return items;
    }
}
