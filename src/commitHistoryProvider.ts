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
        // Expanding a commit → build folder tree from changed files
        if (element instanceof CommitItem) {
            try {
                const files = await this.gitService.getCommitFiles(element.commitInfo.hash);
                if (files.length === 0) {
                    return [];
                }
                const repoRoot = this.gitService.getWorkingDirectory();
                const tree = buildFolderTree(files);

                return this.folderNodeToItems(tree, element.commitInfo.hash, repoRoot);
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
