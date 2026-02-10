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

const STATUS_ICONS: Record<string, { icon: string; color?: string; label: string }> = {
    A: { icon: 'diff-added', color: 'charts.green', label: 'Added' },
    M: { icon: 'diff-modified', color: 'charts.yellow', label: 'Modified' },
    D: { icon: 'diff-removed', color: 'charts.red', label: 'Deleted' },
    R: { icon: 'diff-renamed', color: 'charts.blue', label: 'Renamed' },
    C: { icon: 'diff-added', color: 'charts.blue', label: 'Copied' },
    T: { icon: 'diff-modified', color: 'charts.yellow', label: 'Type changed' },
    U: { icon: 'diff-ignored', label: 'Unmerged' },
};

export class FileChangeItem extends vscode.TreeItem {
    public readonly fileChange: GitFileChange;
    public readonly commitHash: string;

    constructor(fileChange: GitFileChange, commitHash: string, repoRoot: string) {
        const fileName = path.basename(fileChange.filePath);
        const dirPath = path.dirname(fileChange.filePath);

        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.fileChange = fileChange;
        this.commitHash = commitHash;
        this.description = dirPath !== '.' ? dirPath : '';
        this.contextValue = 'fileChange';

        // Status icon
        const statusInfo = STATUS_ICONS[fileChange.status] ?? { icon: 'file', label: fileChange.status };
        this.iconPath = statusInfo.color
            ? new vscode.ThemeIcon(statusInfo.icon, new vscode.ThemeColor(statusInfo.color))
            : new vscode.ThemeIcon(statusInfo.icon);

        this.tooltip = `${statusInfo.label}: ${fileChange.filePath}`;

        // Click to open diff
        const parentRef = `${commitHash}~1`;
        const fileUri = vscode.Uri.file(path.join(repoRoot, fileChange.filePath));

        if (fileChange.status === 'A') {
            // Added: diff empty → new file
            this.command = {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [
                    vscode.Uri.parse(`git:/dev/null`),
                    vscode.Uri.parse(`git-show:${fileChange.filePath}?${encodeURIComponent(JSON.stringify({ ref: commitHash, path: fileChange.filePath }))}`).with({ scheme: 'gitShow', path: fileChange.filePath, query: commitHash }),
                    `${fileName} (Added in ${commitHash.substring(0, 7)})`,
                ],
            };
        } else if (fileChange.status === 'D') {
            // Deleted: diff old file → empty
            this.command = {
                command: 'vscode.open',
                title: 'Show Deleted File',
                arguments: [fileUri],
            };
        } else {
            // Modified/Renamed/etc: diff parent → commit
            const leftUri = toGitUri(fileUri, parentRef);
            const rightUri = toGitUri(fileUri, commitHash);
            this.command = {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [
                    leftUri,
                    rightUri,
                    `${fileName} (${commitHash.substring(0, 7)})`,
                ],
            };
        }
    }
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    // The built-in Git extension uses the 'git' scheme with query params
    const query = JSON.stringify({ path: uri.fsPath, ref });
    return uri.with({ scheme: 'git', path: uri.path, query });
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
