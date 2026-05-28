import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import type { GitFileChange, GitService } from '../gitService';
import { confirmDangerousOperation, showModalInformationMessage, showModalWarningMessage } from '../utils/confirmation';
import { getCommitWebUrl, getRepositoryWebUrl } from '../utils/remoteUrl';
import { ensureNoMergeCommits, ensureSingleCurrentBranchCommit, refreshAfterMutation } from './historySafety';
import { promptSquashMessage } from './squashMessage';

type RepositoryRefreshCallback = () => Promise<void> | void;

export async function handleCreatePatch(
    gitService: GitService,
    item?: CommitItem,
    selectedItems?: CommitItem[],
): Promise<void> {
    const commits = getSelectedCommits(item, selectedItems);
    if (commits.length === 0) { return; }
    const patchCommits = [...commits].reverse();

    try {
        const patch = (await Promise.all(
            patchCommits.map((commit) => gitService.createPatch(commit.hash)),
        )).join('\n');
        const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(
                gitService.getWorkingDirectory(),
                getPatchFileName(commits),
            )),
            filters: {
                Patch: ['patch', 'diff'],
                'All Files': ['*'],
            },
            title: 'Create Patch',
        });
        if (!target) { return; }

        await vscode.workspace.fs.writeFile(target, Buffer.from(patch, 'utf8'));
        const label = commits.length > 1 ? 'Patches' : 'Patch';
        await vscode.window.showInformationMessage(`${label} created: ${path.basename(target.fsPath)}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const label = commits.length > 1 ? 'Create patches' : 'Create patch';
        await vscode.window.showErrorMessage(`${label} failed: ${message}`);
    }
}

export async function handleCompareWithLocal(
    gitService: GitService,
    item?: CommitItem,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    try {
        const changes = await gitService.getFilesChangedFrom(commit.hash);
        if (changes.length === 0) {
            await vscode.window.showInformationMessage(`No local differences from ${commit.shortHash}.`);
            return;
        }

        const selected = changes.length === 1
            ? { change: changes[0] }
            : await vscode.window.showQuickPick(
                changes.map((change) => ({
                    label: change.filePath,
                    description: change.status,
                    detail: change.origPath ? `Renamed from ${change.origPath}` : undefined,
                    change,
                })),
                {
                    placeHolder: `Select a file to compare with ${commit.shortHash}`,
                    matchOnDescription: true,
                    matchOnDetail: true,
                },
            );

        if (!selected) { return; }
        await openLocalComparison(gitService, commit.hash, commit.shortHash, selected.change);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Compare with local failed: ${message}`);
    }
}

export async function handleShowRepositoryAtRevision(
    context: vscode.ExtensionContext,
    gitService: GitService,
    item?: CommitItem,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    try {
        const repoName = path.basename(gitService.getWorkingDirectory()) || 'repository';
        const repoId = crypto
            .createHash('sha1')
            .update(gitService.getWorkingDirectory())
            .digest('hex')
            .substring(0, 8);
        const worktreesRoot = path.join(context.globalStorageUri.fsPath, 'revision-worktrees');
        await fs.mkdir(worktreesRoot, { recursive: true });
        const worktreePath = path.join(worktreesRoot, `${sanitizePathPart(repoName)}-${repoId}-${commit.shortHash}`);

        if (!(await pathExists(worktreePath))) {
            await gitService.createDetachedWorktree(worktreePath, commit.hash);
        }
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Show repository at revision failed: ${message}`);
    }
}

export async function handleUndoCommit(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    const [head] = await gitService.getLog(1, 0);
    if (!head || head.hash !== commit.hash || commit.parentHashes.length === 0) {
        await vscode.window.showWarningMessage('Only the latest non-root commit can be undone.');
        return;
    }

    const confirmed = await showModalWarningMessage(
        `Undo latest commit ${commit.shortHash}? Changes will remain staged.`,
        'Undo Commit',
    );
    if (confirmed !== 'Undo Commit') {
        return;
    }

    try {
        await gitService.undoLastCommit();
        await vscode.window.showInformationMessage(`Undid commit ${commit.shortHash}.`);
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Undo commit failed: ${message}`);
    }
}

export async function handleSquashIntoParent(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    if (!(await ensureNoMergeCommits([commit], 'Squash into parent'))) {
        return;
    }
    if (!(await ensureSingleCurrentBranchCommit(gitService, commit, 'Squash into parent'))) {
        return;
    }

    if (commit.parentHashes.length !== 1) {
        await vscode.window.showWarningMessage('Squash into requires a normal commit with one parent.');
        return;
    }

    const parent = await gitService.getCommit(commit.parentHashes[0]);
    if (!parent) {
        await vscode.window.showWarningMessage('Cannot squash into parent: parent commit was not found.');
        return;
    }

    const confirmed = await confirmDangerousOperation('squash into its parent', commit);
    if (!confirmed) {
        return;
    }

    const squashMessage = await promptSquashMessage(parent.message);
    if (!squashMessage) {
        return;
    }

    const hasChanges = await gitService.hasUncommittedChanges();
    if (hasChanges) {
        await vscode.window.showWarningMessage('You have uncommitted changes. Please commit or stash them before squashing.');
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Squashing ${commit.shortHash} into ${parent.shortHash}...`,
                cancellable: false,
            },
            async () => {
                await gitService.squashCommits(parent.hash, [commit.hash], squashMessage);
            },
        );
        await vscode.window.showInformationMessage(`Squashed ${commit.shortHash} into ${parent.shortHash}.`);
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Squash into failed: ${message}`);
    }
}

export async function handleInteractiveRebaseFrom(
    gitService: GitService,
    item?: CommitItem,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    if (commit.parentHashes.length > 1) {
        await vscode.window.showWarningMessage('Interactive rebase for merge commits is not supported here.');
        return;
    }
    if (!(await ensureSingleCurrentBranchCommit(gitService, commit, 'Interactive rebase'))) {
        return;
    }

    if (await gitService.isRebaseInProgress()) {
        await vscode.window.showWarningMessage('A rebase is already in progress.');
        return;
    }
    if (await gitService.isMergeInProgress()) {
        await vscode.window.showWarningMessage('A merge is in progress. Finish or abort it before rebasing.');
        return;
    }
    if (await gitService.hasUncommittedChanges()) {
        await vscode.window.showWarningMessage('You have uncommitted changes. Please commit or stash them before rebasing.');
        return;
    }

    const rebaseTarget = commit.parentHashes.length === 0 ? '--root' : `${commit.hash}~1`;
    const terminal = vscode.window.createTerminal({
        name: `Look Git Rebase ${commit.shortHash}`,
        cwd: gitService.getWorkingDirectory(),
    });
    terminal.show();
    terminal.sendText(`git rebase -i ${rebaseTarget}`);
}

export async function handleNewBranchFromCommit(
    gitService: GitService,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    const branchName = await vscode.window.showInputBox({
        prompt: `New branch from ${commit.shortHash}`,
        placeHolder: 'feature/my-branch',
        validateInput: (value) => value.trim() ? null : 'Branch name cannot be empty',
    });
    if (!branchName?.trim()) {
        return;
    }

    try {
        await gitService.checkoutNewBranch(branchName.trim(), commit.hash);
        await vscode.window.showInformationMessage(`Created branch ${branchName.trim()} from ${commit.shortHash}.`);
        await refreshRepositoryViews?.();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Create branch failed: ${message}`);
    }
}

export async function handleNewTagFromCommit(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem,
    refreshRepositoryViews?: RepositoryRefreshCallback,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    const tagName = await vscode.window.showInputBox({
        prompt: `New tag on ${commit.shortHash}`,
        placeHolder: 'v1.0.0',
        validateInput: (value) => value.trim() ? null : 'Tag name cannot be empty',
    });
    if (!tagName?.trim()) {
        return;
    }

    try {
        await gitService.createTag(tagName.trim(), commit.hash);
        await vscode.window.showInformationMessage(`Created tag ${tagName.trim()} on ${commit.shortHash}.`);
        await refreshAfterMutation(historyProvider, refreshRepositoryViews);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Create tag failed: ${message}`);
    }
}

export async function handleViewCommitInBrowser(
    gitService: GitService,
    item?: CommitItem,
): Promise<void> {
    const commit = item?.commitInfo;
    if (!commit) { return; }

    try {
        const remoteUrl = await gitService.getRemoteUrl();
        const repositoryWebUrl = getRepositoryWebUrl(remoteUrl);
        if (!repositoryWebUrl) {
            await vscode.window.showWarningMessage('No supported web remote is configured.');
            return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(getCommitWebUrl(repositoryWebUrl, commit.hash)));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Open commit in browser failed: ${message}`);
    }
}

function getSelectedCommits(item?: CommitItem, selectedItems?: CommitItem[]): CommitItem['commitInfo'][] {
    if (selectedItems && selectedItems.length > 1) {
        return selectedItems.map((selected) => selected.commitInfo);
    }
    return item ? [item.commitInfo] : [];
}

function getPatchFileName(commits: CommitItem['commitInfo'][]): string {
    if (commits.length > 1) {
        const newest = commits[0];
        const oldest = commits[commits.length - 1];
        return `${oldest.shortHash}-${newest.shortHash}-${commits.length}-commits.patch`;
    }

    const [commit] = commits;
    const subject = sanitizePathPart(commit.message).slice(0, 80) || 'commit';
    return `${commit.shortHash}-${subject}.patch`;
}

function sanitizePathPart(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function pathExists(value: string): Promise<boolean> {
    try {
        await fs.access(value);
        return true;
    } catch {
        return false;
    }
}

async function openLocalComparison(
    gitService: GitService,
    commitHash: string,
    shortHash: string,
    change: GitFileChange,
): Promise<void> {
    const cwd = gitService.getWorkingDirectory();
    const fileUri = vscode.Uri.file(path.join(cwd, change.filePath));
    const originalFileUri = vscode.Uri.file(path.join(cwd, change.origPath ?? change.filePath));
    const emptyUri = vscode.Uri.parse(`lookgit-empty:${change.filePath}`);

    const toGitUri = (uri: vscode.Uri): vscode.Uri => {
        const query = JSON.stringify({ path: uri.fsPath, ref: commitHash });
        return uri.with({ scheme: 'git', path: uri.path, query });
    };

    let leftUri: vscode.Uri;
    let rightUri: vscode.Uri;
    if (change.status === 'A') {
        leftUri = emptyUri;
        rightUri = fileUri;
    } else if (change.status === 'D') {
        leftUri = toGitUri(originalFileUri);
        rightUri = emptyUri;
    } else {
        leftUri = toGitUri(originalFileUri);
        rightUri = fileUri;
    }

    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `${change.filePath} (${shortHash} vs local)`,
    );
}
