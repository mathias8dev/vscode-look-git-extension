import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from './gitService';
import { CommitItem, LoadMoreItem } from './commitItem';

export class CommitHistoryProvider implements vscode.TreeDataProvider<CommitItem | LoadMoreItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<CommitItem | LoadMoreItem | undefined | null | void>();
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

    getTreeItem(element: CommitItem | LoadMoreItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CommitItem | LoadMoreItem): Promise<(CommitItem | LoadMoreItem)[]> {
        if (element) {
            return [];
        }

        if (this.commits.length === 0) {
            try {
                this.commits = await this.gitService.getLog(this.pageSize, 0);
                this.hasMore = this.commits.length === this.pageSize;
            } catch {
                return [];
            }
        }

        const items: (CommitItem | LoadMoreItem)[] = this.commits.map(
            (commit, index) => new CommitItem(commit, index === 0)
        );

        if (this.hasMore) {
            items.push(new LoadMoreItem());
        }

        return items;
    }
}
