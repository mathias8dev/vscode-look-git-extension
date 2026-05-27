import * as vscode from 'vscode';
import type { GitService, GitCommitInfo } from './gitService';
import { CommitItem, FileChangeItem, FolderItem, LoadMoreItem, buildFolderTree } from './commitItem';

export type TreeItem = CommitItem | FileChangeItem | FolderItem | LoadMoreItem;

export class CommitHistoryProvider implements vscode.TreeDataProvider<TreeItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private commits: GitCommitInfo[] = [];
    private pageSize: number;
    private hasMore: boolean = true;
    private loadMorePromise?: Promise<void>;
    private loadMoreScheduled = false;
    private viewAsTree = true;

    constructor(private gitService: GitService) {
        this.pageSize = vscode.workspace.getConfiguration('lookGit').get('maxCommits', 50);
        void vscode.commands.executeCommand('setContext', 'lookGit.historyViewAsTree', true);
    }

    public setViewMode(asTree: boolean): void {
        this.viewAsTree = asTree;
        void vscode.commands.executeCommand('setContext', 'lookGit.historyViewAsTree', asTree);
        this._onDidChangeTreeData.fire();
    }

    public refresh(): void {
        this.commits = [];
        this.hasMore = true;
        this._onDidChangeTreeData.fire();
    }

    public async loadMore(): Promise<void> {
        if (this.loadMorePromise) {
            return this.loadMorePromise;
        }

        this.loadMorePromise = this.loadMorePage();
        try {
            await this.loadMorePromise;
        } finally {
            this.loadMorePromise = undefined;
        }
    }

    private async loadMorePage(): Promise<void> {
        const skip = this.commits.length;
        const newCommits = await this.gitService.getLog(this.pageSize, skip);
        this.commits.push(...newCommits);
        this.hasMore = newCommits.length === this.pageSize;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    resolveTreeItem(item: vscode.TreeItem, element: TreeItem, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        if (element instanceof LoadMoreItem) {
            this.scheduleLoadMore();
        }
        return item;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        // Expanding a commit → show changed files (tree or flat list)
        if (element instanceof CommitItem) {
            try {
                const files = await this.gitService.getCommitFiles(element.commitInfo.hash);
                if (files.length === 0) {
                    return [];
                }
                const repoRoot = this.gitService.getWorkingDirectory();

                if (this.viewAsTree) {
                    const tree = buildFolderTree(files);
                    return this.folderNodeToItems(tree, element.commitInfo.hash, repoRoot);
                }

                // Flat list: sort by full path, show directory in description
                const sorted = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));
                return sorted.map(f => new FileChangeItem(f, element.commitInfo.hash, repoRoot, true));
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`Look Git: failed to get files for ${element.commitInfo.shortHash}: ${msg}`);
                return [];
            }
        }

        // Expanding a folder → show its subfolders and files
        if (element instanceof FolderItem) {
            return this.folderNodeToItems(
                element.folderNode,
                element.commitHash,
                element.repoRoot
            );
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

    private scheduleLoadMore(): void {
        if (!this.hasMore || this.loadMorePromise || this.loadMoreScheduled) {
            return;
        }

        this.loadMoreScheduled = true;
        setTimeout(() => {
            this.loadMoreScheduled = false;
            void this.loadMore().catch((error) => {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`Look Git: failed to load more commits: ${msg}`);
            });
        }, 0);
    }

    private folderNodeToItems(
        node: { children: Map<string, import('./commitItem').FolderNode>; files: import('./gitService').GitFileChange[] },
        commitHash: string,
        repoRoot: string
    ): TreeItem[] {
        const items: TreeItem[] = [];

        // Folders first (sorted alphabetically)
        const sortedFolders = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
        for (const [, child] of sortedFolders) {
            items.push(new FolderItem(child, commitHash, repoRoot));
        }

        // Then files (sorted alphabetically)
        const sortedFiles = [...node.files].sort((a, b) => a.filePath.localeCompare(b.filePath));
        for (const file of sortedFiles) {
            items.push(new FileChangeItem(file, commitHash, repoRoot));
        }

        return items;
    }
}
