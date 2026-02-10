import * as vscode from 'vscode';
import type { GitCommitInfo } from './gitService';

export class CommitItem extends vscode.TreeItem {
    public readonly commitInfo: GitCommitInfo;

    constructor(commit: GitCommitInfo, isHead: boolean) {
        const label = `${commit.shortHash}  ${commit.message}`;
        super(label, vscode.TreeItemCollapsibleState.None);

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
