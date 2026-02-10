import * as vscode from 'vscode';
import * as path from 'path';
import type { GitCommitInfo, GitFileChange } from './gitService';

export class CommitItem extends vscode.TreeItem {
    public readonly commitInfo: GitCommitInfo;

    constructor(commit: GitCommitInfo, isHead: boolean) {
        const label = `${commit.shortHash}  ${commit.message}`;
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.commitInfo = commit;
        this.description = `${commit.authorName} - ${this.formatRelativeDate(commit.authorDate)}`;

        this.tooltip = new vscode.MarkdownString(
            `**${commit.message}**\n\n` +
            `- **Hash:** \`${commit.hash}\`\n` +
            `- **Author:** ${commit.authorName} <${commit.authorEmail}>\n` +
            `- **Date:** ${commit.authorDate.toLocaleString()}\n` +
            `- **Parents:** ${commit.parentHashes.join(', ') || 'none'}`
        );

        this.contextValue = 'commit';

        if (isHead) {
            this.iconPath = new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('charts.green'));
        } else {
            this.iconPath = new vscode.ThemeIcon('git-commit');
        }
    }

    private formatRelativeDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) { return 'just now'; }
        if (diffMins < 60) { return `${diffMins} min ago`; }
        if (diffHours < 24) { return `${diffHours} hours ago`; }
        if (diffDays < 30) { return `${diffDays} days ago`; }
        return date.toLocaleDateString();
    }
}

const STATUS_LABELS: Record<string, string> = {
    A: 'A',
    M: 'M',
    D: 'D',
    R: 'R',
    C: 'C',
    T: 'T',
    U: 'U',
};

const STATUS_COLORS: Record<string, string> = {
    A: 'gitDecoration.addedResourceForeground',
    M: 'gitDecoration.modifiedResourceForeground',
    D: 'gitDecoration.deletedResourceForeground',
    R: 'gitDecoration.renamedResourceForeground',
    C: 'gitDecoration.addedResourceForeground',
    T: 'gitDecoration.modifiedResourceForeground',
    U: 'gitDecoration.conflictingResourceForeground',
};

export class FileChangeItem extends vscode.TreeItem {
    public readonly fileChange: GitFileChange;
    public readonly commitHash: string;

    constructor(fileChange: GitFileChange, commitHash: string, repoRoot: string) {
        const fileName = path.basename(fileChange.filePath);
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.fileChange = fileChange;
        this.commitHash = commitHash;
        this.contextValue = 'fileChange';

        // Use resourceUri so VS Code resolves the file icon from the user's icon theme
        this.resourceUri = vscode.Uri.file(path.join(repoRoot, fileChange.filePath));

        // Show git status letter as description with appropriate color
        const statusLabel = STATUS_LABELS[fileChange.status] ?? fileChange.status;
        this.description = statusLabel;

        // Apply decorations color to the label
        const color = STATUS_COLORS[fileChange.status];
        if (color) {
            this.iconPath = vscode.ThemeIcon.File;
        }

        this.tooltip = `${fileChange.filePath} [${statusLabel}]`;

        // Click to open diff
        const fileUri = vscode.Uri.file(path.join(repoRoot, fileChange.filePath));
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${fileChange.filePath}`);
        const shortRef = commitHash.substring(0, 7);

        if (fileChange.status === 'A') {
            // Added: empty → new file
            this.command = {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [
                    emptyUri,
                    toGitUri(fileUri, commitHash),
                    `${fileName} (Added in ${shortRef})`,
                ],
            };
        } else if (fileChange.status === 'D') {
            // Deleted: old file → empty
            this.command = {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [
                    toGitUri(fileUri, `${commitHash}~1`),
                    emptyUri,
                    `${fileName} (Deleted in ${shortRef})`,
                ],
            };
        } else {
            // Modified/Renamed/etc: parent → commit
            this.command = {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [
                    toGitUri(fileUri, `${commitHash}~1`),
                    toGitUri(fileUri, commitHash),
                    `${fileName} (${shortRef})`,
                ],
            };
        }
    }
}

export interface FolderNode {
    name: string;
    fullPath: string;
    children: Map<string, FolderNode>;
    files: GitFileChange[];
}

export class FolderItem extends vscode.TreeItem {
    public readonly folderNode: FolderNode;
    public readonly commitHash: string;
    public readonly repoRoot: string;

    constructor(folderNode: FolderNode, commitHash: string, repoRoot: string) {
        super(folderNode.name, vscode.TreeItemCollapsibleState.Expanded);

        this.folderNode = folderNode;
        this.commitHash = commitHash;
        this.repoRoot = repoRoot;
        this.contextValue = 'folder';

        // Use resourceUri so VS Code resolves the folder icon from the user's icon theme
        this.resourceUri = vscode.Uri.file(path.join(repoRoot, folderNode.fullPath));
        this.iconPath = vscode.ThemeIcon.Folder;

        this.tooltip = folderNode.fullPath;
    }
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    const query = JSON.stringify({ path: uri.fsPath, ref });
    return uri.with({ scheme: 'git', path: uri.path, query });
}

export function buildFolderTree(files: GitFileChange[]): FolderNode {
    const root: FolderNode = { name: '', fullPath: '', children: new Map(), files: [] };

    for (const file of files) {
        const parts = file.filePath.split('/');
        let current = root;

        // Navigate/create folder nodes for all directory segments
        for (let i = 0; i < parts.length - 1; i++) {
            const segment = parts[i];
            if (!current.children.has(segment)) {
                const fullPath = parts.slice(0, i + 1).join('/');
                current.children.set(segment, {
                    name: segment,
                    fullPath,
                    children: new Map(),
                    files: [],
                });
            }
            current = current.children.get(segment)!;
        }

        // Add the file to the deepest folder
        current.files.push(file);
    }

    return compactFolderTree(root);
}

// Compact single-child folders: src/commands → src/commands (instead of src → commands)
function compactFolderTree(node: FolderNode): FolderNode {
    for (const [key, child] of node.children) {
        const compacted = compactFolderTree(child);
        node.children.set(key, compacted);
    }

    // If this node has exactly one child folder and no files, merge them
    if (node.children.size === 1 && node.files.length === 0 && node.name !== '') {
        const [, onlyChild] = [...node.children.entries()][0];
        return {
            name: `${node.name}/${onlyChild.name}`,
            fullPath: onlyChild.fullPath,
            children: onlyChild.children,
            files: onlyChild.files,
        };
    }

    return node;
}

export class LoadMoreItem extends vscode.TreeItem {
    constructor() {
        super('Load more commits...', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'lookGit.loadMore',
            title: 'Load More',
        };
        this.contextValue = 'loadMore';
        this.iconPath = new vscode.ThemeIcon('ellipsis');
    }
}
