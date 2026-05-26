import * as vscode from 'vscode';
import * as path from 'path';
import type { GitService, StashEntry, GitFileChange } from '../gitService';

export class StashEntryItem extends vscode.TreeItem {
    constructor(public readonly stash: StashEntry) {
        super(
            `stash@{${stash.index}}: ${stash.message}`,
            vscode.TreeItemCollapsibleState.Collapsed,
        );
        this.contextValue = 'stashEntry';
        this.iconPath = new vscode.ThemeIcon('archive');
        this.tooltip = `stash@{${stash.index}}: ${stash.message}`;
    }
}

class StashFileItem extends vscode.TreeItem {
    constructor(
        public readonly file: GitFileChange,
        public readonly stashIndex: number,
        repoRoot: string,
    ) {
        super(path.basename(file.filePath), vscode.TreeItemCollapsibleState.None);

        this.resourceUri = vscode.Uri.file(path.join(repoRoot, file.filePath));
        this.contextValue = 'stashFile';

        const dir = path.dirname(file.filePath);
        this.description = dir !== '.' ? dir : undefined;

        this.tooltip = `${file.filePath} [${file.status}]`;

        this.command = {
            command: 'lookGit.openStashDiff',
            title: 'Show Stash Diff',
            arguments: [file.filePath, stashIndex, file.status],
        };
    }
}

type StashTreeItem = StashEntryItem | StashFileItem;

export class StashProvider implements vscode.TreeDataProvider<StashTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private gitService: GitService) {}

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StashTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StashTreeItem): Promise<StashTreeItem[]> {
        if (!element) {
            try {
                const stashes = await this.gitService.stashList();
                return stashes.map(s => new StashEntryItem(s));
            } catch {
                return [];
            }
        }

        if (element instanceof StashEntryItem) {
            try {
                const files = await this.gitService.getStashFiles(element.stash.index);
                const repoRoot = this.gitService.getWorkingDirectory();
                return files.map(f => new StashFileItem(f, element.stash.index, repoRoot));
            } catch {
                return [];
            }
        }

        return [];
    }
}
