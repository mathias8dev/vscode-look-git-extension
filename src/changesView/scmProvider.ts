import * as vscode from 'vscode';
import * as path from 'path';
import type { GitService, GitStatusEntry } from '../gitService';

type CommitMode = 'commit' | 'amend' | 'commitPush' | 'commitSync';

const COMMIT_MODE_LABELS: Record<CommitMode, string> = {
    commit: 'Commit',
    amend: 'Amend',
    commitPush: 'Commit & Push',
    commitSync: 'Commit & Sync',
};

const COMMIT_MODE_ORDER: CommitMode[] = ['commit', 'amend', 'commitPush', 'commitSync'];

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    const query = JSON.stringify({ path: uri.fsPath, ref });
    return uri.with({ scheme: 'git', path: uri.path, query });
}

export class LookGitScmProvider implements vscode.Disposable {
    private sourceControl: vscode.SourceControl;
    private stagedGroup: vscode.SourceControlResourceGroup;
    private changesGroup: vscode.SourceControlResourceGroup;
    private conflictsGroup: vscode.SourceControlResourceGroup;
    private disposables: vscode.Disposable[] = [];
    private commitMode: CommitMode = 'commit';

    constructor(private gitService: GitService) {
        const rootUri = vscode.Uri.file(gitService.getWorkingDirectory());

        this.sourceControl = vscode.scm.createSourceControl('lookGit', 'Look Git', rootUri);
        this.disposables.push(this.sourceControl);

        this.sourceControl.inputBox.placeholder = 'Message (Ctrl+Enter to commit)';
        this.sourceControl.acceptInputCommand = {
            command: 'lookGit.scmCommit',
            title: 'Commit',
        };
        this.sourceControl.count = 0;

        this.conflictsGroup = this.sourceControl.createResourceGroup('conflicts', 'Merge Changes');
        this.conflictsGroup.hideWhenEmpty = true;

        this.stagedGroup = this.sourceControl.createResourceGroup('staged', 'Staged Changes');
        this.stagedGroup.hideWhenEmpty = true;

        this.changesGroup = this.sourceControl.createResourceGroup('changes', 'Changes');
        this.changesGroup.hideWhenEmpty = true;

        this.updateStatusBar();
    }

    get inputBox(): vscode.SourceControlInputBox {
        return this.sourceControl.inputBox;
    }

    public getCommitMode(): CommitMode {
        return this.commitMode;
    }

    public cycleCommitMode(): void {
        const idx = COMMIT_MODE_ORDER.indexOf(this.commitMode);
        this.commitMode = COMMIT_MODE_ORDER[(idx + 1) % COMMIT_MODE_ORDER.length];
        this.updateStatusBar();
    }

    public async refresh(): Promise<void> {
        try {
            const status = await this.gitService.getStatus();

            this.stagedGroup.resourceStates = status.staged.map(
                entry => this.toResourceState(entry, true),
            );
            this.changesGroup.resourceStates = status.unstaged.map(
                entry => this.toResourceState(entry, false),
            );
            this.conflictsGroup.resourceStates = status.conflicts.map(
                entry => this.toConflictResourceState(entry),
            );

            const total = status.staged.length + status.unstaged.length + status.conflicts.length;
            this.sourceControl.count = total;

            vscode.commands.executeCommand('setContext', 'lookGit.conflictState', status.conflictState);
            this.updateStatusBar(status.conflictState);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`Look Git: failed to refresh SCM: ${msg}`);
        }
    }

    public openStashDiff(filePath: string, stashIndex: number, status: string): void {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, filePath));
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const stashRef = `stash@{${stashIndex}}`;
        const parentRef = `stash@{${stashIndex}}^`;

        if (status === 'A') {
            const rightUri = toGitUri(fileUri, stashRef);
            vscode.commands.executeCommand(
                'vscode.diff', emptyUri, rightUri,
                `${filePath} (Stash #${stashIndex})`,
            );
        } else if (status === 'D') {
            const leftUri = toGitUri(fileUri, parentRef);
            vscode.commands.executeCommand(
                'vscode.diff', leftUri, emptyUri,
                `${filePath} (Stash #${stashIndex} - Deleted)`,
            );
        } else {
            const leftUri = toGitUri(fileUri, parentRef);
            const rightUri = toGitUri(fileUri, stashRef);
            vscode.commands.executeCommand(
                'vscode.diff', leftUri, rightUri,
                `${filePath} (Stash #${stashIndex})`,
            );
        }
    }

    private toResourceState(
        entry: GitStatusEntry,
        isStaged: boolean,
    ): vscode.SourceControlResourceState {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, entry.filePath));
        const statusChar = this.getDisplayStatus(entry, isStaged);

        return {
            resourceUri: fileUri,
            contextValue: isStaged ? 'staged' : 'unstaged',
            command: this.buildDiffCommand(entry.filePath, fileUri, isStaged, statusChar),
            decorations: {
                tooltip: `${entry.filePath} [${statusChar}]`,
                strikeThrough: statusChar === 'D',
                faded: statusChar === 'D',
                iconPath: this.getStatusThemeIcon(statusChar),
            },
        };
    }

    private toConflictResourceState(
        entry: GitStatusEntry,
    ): vscode.SourceControlResourceState {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, entry.filePath));

        return {
            resourceUri: fileUri,
            contextValue: 'conflict',
            command: {
                command: 'lookGit.openMergeEditor',
                title: 'Open Merge Editor',
                arguments: [fileUri],
            },
            decorations: {
                tooltip: `${entry.filePath} [Conflict]`,
                iconPath: new vscode.ThemeIcon(
                    'warning',
                    new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'),
                ),
            },
        };
    }

    private buildDiffCommand(
        filePath: string,
        fileUri: vscode.Uri,
        isStaged: boolean,
        statusChar: string,
    ): vscode.Command {
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        if (isStaged) {
            const leftUri = statusChar === 'A' ? emptyUri : toGitUri(fileUri, 'HEAD');
            const rightUri = toGitUri(fileUri, '');
            return {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [leftUri, rightUri, `${filePath} (Staged)`],
            };
        }

        if (statusChar === 'U') {
            return {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [fileUri],
            };
        }

        if (statusChar === 'D') {
            const leftUri = toGitUri(fileUri, '');
            return {
                command: 'vscode.diff',
                title: 'Show Changes',
                arguments: [leftUri, emptyUri, `${filePath} (Deleted)`],
            };
        }

        // Modified unstaged: index vs working tree
        const leftUri = toGitUri(fileUri, '');
        return {
            command: 'vscode.diff',
            title: 'Show Changes',
            arguments: [leftUri, fileUri, `${filePath} (Working Tree)`],
        };
    }

    private getDisplayStatus(entry: GitStatusEntry, isStaged: boolean): string {
        if (entry.indexStatus === '?' || entry.workTreeStatus === '?') {
            return 'U';
        }
        return isStaged ? entry.indexStatus : entry.workTreeStatus;
    }

    private getStatusThemeIcon(status: string): vscode.ThemeIcon {
        const iconMap: Record<string, [string, string]> = {
            A: ['diff-added', 'gitDecoration.addedResourceForeground'],
            M: ['diff-modified', 'gitDecoration.modifiedResourceForeground'],
            D: ['diff-removed', 'gitDecoration.deletedResourceForeground'],
            R: ['diff-renamed', 'gitDecoration.renamedResourceForeground'],
            C: ['diff-added', 'gitDecoration.addedResourceForeground'],
            T: ['diff-modified', 'gitDecoration.modifiedResourceForeground'],
            U: ['diff-added', 'gitDecoration.untrackedResourceForeground'],
        };
        const [icon, color] = iconMap[status] ?? ['diff-modified', 'gitDecoration.modifiedResourceForeground'];
        return new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    }

    private updateStatusBar(conflictState: 'none' | 'merge' | 'rebase' = 'none'): void {
        const commands: vscode.Command[] = [];

        commands.push({
            command: 'lookGit.cycleCommitMode',
            title: `$(git-commit) ${COMMIT_MODE_LABELS[this.commitMode]}`,
            tooltip: 'Click to change commit mode',
        });

        if (conflictState !== 'none') {
            const label = conflictState === 'merge' ? 'Merge' : 'Rebase';
            commands.push({
                command: 'lookGit.continueMergeRebase',
                title: `$(warning) ${label} in Progress`,
                tooltip: `Click to continue ${label}`,
            });
        }

        this.sourceControl.statusBarCommands = commands;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
