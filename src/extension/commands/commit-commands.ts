import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { GitRepository } from '../../application/ports/git-repository';
import { CliRemoteCommandKind, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import type { CommitCommand } from '../../protocol/graph/messages';
import type { CommitReferenceActions } from '../../application/usecases/commits/commit-reference-actions';
import { defaultCommitReferenceActions } from '../adapters/vscode/default-commit-reference-actions';
import { CreateCommitPatchResultKind, type CreateCommitPatchUseCase, type CreateCommitPatchResult } from '../../application/usecases/commits/create-commit-patch';
import { defaultCreateCommitPatch } from '../adapters/vscode/default-create-commit-patch';
import { type ExplainCommitDiffUseCase } from '../../application/usecases/commits/explain-commit-diff';
import { defaultExplainCommitDiff } from '../adapters/vscode/default-explain-commit-diff';
import { orderSelectedCommits } from '../../application/usecases/commits/order-selected-commits';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { showModalWarningMessage } from '../utils/confirmation';
import { openDiffExplanationDocument, showDiffExplanationError } from '../utils/diff-explanation-document';
import { isAbortError } from '../messaging/errorSerialization';
import { withCancellationSignal } from '../utils/vscode-cancellation';
import { showBranchNameInput } from '../utils/branch-name-input';
import { assertNoUnmergedFiles, compareRefWithPickedWorktree, openChangesWithWorkingTree, promptNewWorktreePath } from './git-command-helpers';

export interface CommitCommandDiffExplanationScope {
    readonly label: string;
    readonly value: string;
}

export async function runCommitCommand(
    repo: GitRepository,
    command: CommitCommand,
    hash: string,
    hashes: readonly string[],
    remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
    commitReferenceActions: CommitReferenceActions = defaultCommitReferenceActions,
    createCommitPatch: CreateCommitPatchUseCase = defaultCreateCommitPatch,
    explainCommitDiffUseCase: ExplainCommitDiffUseCase = defaultExplainCommitDiff,
    diffExplanationScope?: CommitCommandDiffExplanationScope,
): Promise<boolean> {
    const selected = normalizeSelectedHashes(hash, hashes);
    switch (command) {
        case 'copyRevisionNumber':
            await commitReferenceActions.copyRevisionNumber(hash);
            return false;
        case 'createPatch':
            await showCommitPatchNotification(await createCommitPatch.execute(repo, selected));
            return false;
        case 'explainDiff':
            await explainCommitDiff(repo, selected, explainCommitDiffUseCase, diffExplanationScope);
            return false;
        case 'cherryPick':
            await assertNoUnmergedFiles(repo, 'cherry-picking commits');
            await assertCherryPickableCommits(repo, selected);
            await repo.exec(['cherry-pick', ...(await orderSelectedCommits(repo, selected, 'oldestFirst'))]);
            return true;
        case 'checkoutRevision':
            await repo.checkout(hash);
            return true;
        case 'showRepositoryAtRevision':
            await showRepositoryAtRevision(hash, repo.exec.bind(repo));
            return false;
        case 'compareWithLocal':
            await openChangesWithWorkingTree(repo, repo.cwd, hash, `Diff ${hash.substring(0, 7)}..local`);
            return false;
        case 'resetCurrentBranchToHere':
            await resetCurrentBranchToHere(repo, hash);
            return true;
        case 'revertCommit':
            await assertNoUnmergedFiles(repo, 'reverting commits');
            await repo.exec(['revert', '--no-edit', ...(await orderSelectedCommits(repo, selected, 'newestFirst'))]);
            return true;
        case 'undoCommit':
            await undoHeadCommit(repo, hash);
            return true;
        case 'editCommitMessage':
            await editCommitMessage(repo, hash);
            return true;
        case 'fixup':
            await fixupStagedChanges(repo, hash);
            return true;
        case 'squashInto':
            await squashSelectedCommits(repo, selected);
            return true;
        case 'dropCommit':
            await dropCommits(repo, await orderSelectedCommits(repo, selected, 'newestFirst'));
            return true;
        case 'interactiveRebaseFromHere':
            openGitTerminal(repo.cwd, `git rebase --autostash -i ${shellQuote(hash)}`);
            return false;
        case 'pushAllUpToHere':
            await pushAllUpToHere(repo, hash, remoteCommands);
            return true;
        case 'newBranch':
            return commitReferenceActions.createBranchAtCommit(repo, hash);
        case 'newTag':
            return commitReferenceActions.createTagAtCommit(repo, hash);
        case 'newWorktreeFromCommit':
            return createWorktreeFromCommit(repo, hash);
        case 'compareCommitWithWorktree':
            await compareRefWithPickedWorktree(repo, hash, `Diff ${hash.substring(0, 7)}`);
            return false;
    }
}

async function explainCommitDiff(
    repo: GitRepository,
    hashes: readonly string[],
    useCase: ExplainCommitDiffUseCase,
    scope: CommitCommandDiffExplanationScope | undefined,
): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Explaining commit diff...',
            cancellable: true,
        }, async (_progress, token) => withCancellationSignal(token, async (signal) => {
            const result = await useCase.execute(repo, hashes, signal);
            await openDiffExplanationDocument({
                title: 'Commit Diff Explanation',
                scope: scope?.value,
                scopeLabel: scope?.label,
                itemsTitle: 'Commits',
                items: result.selectedCommits,
                explanation: result.explanation,
                diffTruncated: result.diffTruncated,
            });
        }));
    } catch (error) {
        if (isAbortError(error)) { return; }
        await showDiffExplanationError(error);
    }
}

async function assertCherryPickableCommits(repo: GitRepository, hashes: readonly string[]): Promise<void> {
    const alreadyInCurrentHistory: string[] = [];
    for (const hash of hashes) {
        if (await isAncestorOfHead(repo, hash)) {
            alreadyInCurrentHistory.push(hash.substring(0, 7));
        }
    }
    if (alreadyInCurrentHistory.length > 0) {
        throw new Error(`Cherry-pick is only available for commits outside the current branch history: ${alreadyInCurrentHistory.join(', ')}.`);
    }
}

async function isAncestorOfHead(repo: GitRepository, hash: string): Promise<boolean> {
    try {
        await repo.exec(['merge-base', '--is-ancestor', hash, 'HEAD']);
        return true;
    } catch {
        return false;
    }
}

async function showCommitPatchNotification(result: CreateCommitPatchResult): Promise<void> {
    switch (result.kind) {
        case CreateCommitPatchResultKind.Cancelled:
            return;
        case CreateCommitPatchResultKind.CopiedToClipboard:
            void vscode.window.showInformationMessage('Patch copied to clipboard.');
            return;
        case CreateCommitPatchResultKind.SavedToFile:
            void vscode.window.showInformationMessage(`Patch saved to ${result.filePath ?? 'file'}.`);
            return;
    }
}

function normalizeSelectedHashes(hash: string, hashes: readonly string[]): string[] {
    const selected = hashes.length > 0 ? hashes : [hash];
    return Array.from(new Set(selected.includes(hash) ? selected : [hash, ...selected]));
}

async function showRepositoryAtRevision(
    hash: string,
    exec: (args: readonly string[]) => Promise<string>,
): Promise<void> {
    const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-revision-'));
    const worktreePath = path.join(parentPath, hash.substring(0, 7));
    await exec(['worktree', 'add', '--detach', worktreePath, hash]);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true });
}

async function createWorktreeFromCommit(repo: GitRepository, hash: string): Promise<boolean> {
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for ${hash.substring(0, 7)}:`);
    if (!worktreePath) { return false; }
    const branchName = await showBranchNameInput({
        prompt: `New branch name from ${hash.substring(0, 7)}:`,
    });
    if (!branchName) { return false; }
    await repo.exec(['worktree', 'add', '-b', branchName, worktreePath, hash]);
    return true;
}

async function resetCurrentBranchToHere(repo: GitRepository, hash: string): Promise<void> {
    const mode = await vscode.window.showQuickPick(['Soft reset', 'Mixed reset', 'Hard reset', 'Keep reset'], { placeHolder: 'Reset current branch to selected revision' });
    if (!mode) { return; }
    if (mode === 'Hard reset') {
        const choice = await showModalWarningMessage('Hard reset current branch and discard working tree changes?', 'Hard Reset');
        if (choice !== 'Hard Reset') { return; }
    }
    const flag = mode === 'Soft reset'
        ? '--soft'
        : mode === 'Hard reset'
            ? '--hard'
            : mode === 'Keep reset'
                ? '--keep'
                : '--mixed';
    await repo.exec(['reset', flag, hash]);
}

async function undoHeadCommit(repo: GitRepository, hash: string): Promise<void> {
    const head = await repo.exec(['rev-parse', 'HEAD']);
    if (head !== hash) { throw new Error('Only the current HEAD commit can be undone.'); }
    const choice = await showModalWarningMessage('Undo the current HEAD commit and keep its changes staged?', 'Undo Commit');
    if (choice !== 'Undo Commit') { return; }
    await repo.exec(['reset', '--soft', 'HEAD~1']);
}

async function editCommitMessage(repo: GitRepository, hash: string): Promise<void> {
    const current = await repo.getCommitMessage(hash);
    const message = await vscode.window.showInputBox({ prompt: 'New commit message:', value: current });
    if (!message?.trim()) { return; }
    const messageFile = await writeCommitMessageFile(message);
    try {
        await rewriteCommitMessage(repo, hash, messageFile);
    } finally {
        await fs.rm(path.dirname(messageFile), { recursive: true, force: true });
    }
}

async function rewriteCommitMessage(repo: GitRepository, hash: string, messageFile: string): Promise<void> {
    await assertNoUnmergedFiles(repo, 'editing commit messages');
    const parents = (await repo.exec(['show', '-s', '--format=%P', hash])).split(/\s+/).filter(Boolean);
    if (parents.length > 1) { throw new Error('Editing merge commit messages is not supported yet.'); }
    const currentBranch = await repo.getCurrentBranch();
    const branches = await localBranchesContaining(repo, hash);
    const head = await repo.exec(['rev-parse', 'HEAD']);
    if (branches.length === 0 && head !== hash) {
        throw new Error('Edit Commit Message requires a local branch that contains the selected commit.');
    }
    const [authorName, authorEmail, authorDate] = (await repo.exec(['show', '-s', '--format=%an%x00%ae%x00%aI', hash])).split('\0');
    if (!authorName || !authorEmail || !authorDate) { throw new Error('Could not read commit author metadata.'); }
    const tree = await repo.exec(['show', '-s', '--format=%T', hash]);
    const parentArgs = parents[0] ? ['-p', parents[0]] : [];
    const rewritten = await repo.execWithEnv(
        ['commit-tree', tree, ...parentArgs, '-F', messageFile],
        {
            GIT_AUTHOR_NAME: authorName,
            GIT_AUTHOR_EMAIL: authorEmail,
            GIT_AUTHOR_DATE: authorDate,
        },
    );
    if (branches.length === 0) {
        await repo.exec(['reset', '--soft', rewritten]);
        return;
    }

    try {
        for (const branch of orderBranchesForRewrite(branches, currentBranch)) {
            await rewriteBranchContainingCommit(repo, branch, hash, rewritten, parents[0]);
        }
    } finally {
        if (currentBranch !== 'HEAD' && await repo.getCurrentBranch().catch(() => 'HEAD') !== currentBranch) {
            await repo.checkout(currentBranch);
        }
    }
}

async function localBranchesContaining(repo: GitRepository, hash: string): Promise<readonly string[]> {
    const output = await repo.execRaw(['for-each-ref', '--format=%(refname:short)', '--contains', hash, 'refs/heads']);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function orderBranchesForRewrite(branches: readonly string[], currentBranch: string): readonly string[] {
    if (currentBranch === 'HEAD' || !branches.includes(currentBranch)) { return branches; }
    return [...branches.filter((branch) => branch !== currentBranch), currentBranch];
}

async function rewriteBranchContainingCommit(
    repo: GitRepository,
    branch: string,
    hash: string,
    rewritten: string,
    parentHash: string | undefined,
): Promise<void> {
    const branchTip = await repo.exec(['rev-parse', branch]);
    const currentBranch = await repo.getCurrentBranch();
    if (branchTip === hash) {
        if (branch === currentBranch) {
            await repo.exec(['reset', '--soft', rewritten]);
        } else {
            await repo.exec(['update-ref', `refs/heads/${branch}`, rewritten, hash]);
        }
        return;
    }
    const rebaseArgs = parentHash
        ? ['rebase', '--autostash', '--onto', rewritten, hash, branch]
        : ['rebase', '--autostash', '--onto', rewritten, '--root', branch];
    await repo.exec(rebaseArgs);
}

async function writeCommitMessageFile(message: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-message-'));
    const filePath = path.join(dir, 'COMMIT_EDITMSG');
    await fs.writeFile(filePath, message);
    return filePath;
}

async function fixupStagedChanges(repo: GitRepository, hash: string): Promise<void> {
    await assertNoUnmergedFiles(repo, 'fixing up commits');
    const stagedFiles = await repo.execRaw(['diff', '--cached', '--name-only']);
    if (!stagedFiles.trim()) { throw new Error('Stage changes before using Fixup.'); }
    const dirtyUnstaged = await repo.execRaw(['diff', '--name-only']);
    if (dirtyUnstaged.trim()) { throw new Error('Fixup requires a clean unstaged working tree.'); }
    const parents = (await repo.exec(['show', '-s', '--format=%P', hash])).split(/\s+/).filter(Boolean);
    if (parents.length > 1) { throw new Error('Fixup is not supported for merge commits.'); }

    await repo.exec(['commit', '--fixup', hash, '--no-edit']);

    const branch = await repo.getCurrentBranch();
    const rebaseArgs = parents[0]
        ? ['rebase', '--autosquash', '--autostash', parents[0], branch]
        : ['rebase', '--autosquash', '--autostash', '--root', branch];
    await repo.execWithEnv(rebaseArgs, { GIT_SEQUENCE_EDITOR: 'true', GIT_EDITOR: 'true' });
}

async function squashSelectedCommits(repo: GitRepository, hashes: readonly string[]): Promise<void> {
    await assertNoUnmergedFiles(repo, 'squashing commits');
    const ordered = await orderSelectedCommits(repo, hashes, 'oldestFirst');
    if (ordered.length < 2) { throw new Error('Select at least two commits to squash.'); }

    const range = await validateSquashCommitRange(repo, ordered);
    const defaultMessage = firstCommitMessageLine(await repo.getCommitMessage(ordered[0]!));
    const message = await vscode.window.showInputBox({
        prompt: `Squash ${ordered.length} commits into one message:`,
        value: defaultMessage,
    });
    if (!message?.trim()) { return; }

    const messageFile = await writeCommitMessageFile(message.trim());
    try {
        const rewritten = await createSquashedCommit(repo, ordered[0]!, range.newestHash, range.parentHash, messageFile);
        await replaceCommitRangeWithSquashedCommit(repo, range.newestHash, rewritten);
    } finally {
        await fs.rm(path.dirname(messageFile), { recursive: true, force: true });
    }
}

interface SquashCommitRange {
    readonly parentHash: string | undefined;
    readonly newestHash: string;
}

async function validateSquashCommitRange(repo: GitRepository, hashes: readonly string[]): Promise<SquashCommitRange> {
    let previousHash: string | undefined;
    let parentHash: string | undefined;
    for (const [index, hash] of hashes.entries()) {
        const parents = (await repo.exec(['show', '-s', '--format=%P', hash])).split(/\s+/).filter(Boolean);
        if (parents.length > 1) { throw new Error('Squash Commits is not supported for merge commits.'); }
        if (index === 0) {
            parentHash = parents[0];
        } else if (parents[0] !== previousHash) {
            throw new Error('Squash Commits requires a contiguous linear commit selection.');
        }
        previousHash = hash;
    }
    const newestHash = hashes.at(-1);
    if (!newestHash) { throw new Error('Select at least two commits to squash.'); }
    return { parentHash, newestHash };
}

async function createSquashedCommit(
    repo: GitRepository,
    oldestHash: string,
    newestHash: string,
    parentHash: string | undefined,
    messageFile: string,
): Promise<string> {
    const tree = await repo.exec(['show', '-s', '--format=%T', newestHash]);
    const [authorName, authorEmail, authorDate] = (await repo.exec(['show', '-s', '--format=%an%x00%ae%x00%aI', oldestHash])).split('\0');
    if (!authorName || !authorEmail || !authorDate) { throw new Error('Could not read commit author metadata.'); }
    const parentArgs = parentHash ? ['-p', parentHash] : [];
    return repo.execWithEnv(
        ['commit-tree', tree, ...parentArgs, '-F', messageFile],
        {
            GIT_AUTHOR_NAME: authorName,
            GIT_AUTHOR_EMAIL: authorEmail,
            GIT_AUTHOR_DATE: authorDate,
        },
    );
}

async function replaceCommitRangeWithSquashedCommit(repo: GitRepository, newestHash: string, rewritten: string): Promise<void> {
    const currentBranch = await repo.getCurrentBranch();
    const branches = await localBranchesContaining(repo, newestHash);
    const head = await repo.exec(['rev-parse', 'HEAD']);
    if (branches.length === 0 && head !== newestHash) {
        throw new Error('Squash Commits requires a local branch that contains the selected commits.');
    }
    if (branches.length === 0) {
        await repo.exec(['reset', '--soft', rewritten]);
        return;
    }

    try {
        for (const branch of orderBranchesForRewrite(branches, currentBranch)) {
            await replaceCommitRangeOnBranch(repo, branch, newestHash, rewritten);
        }
    } finally {
        if (currentBranch !== 'HEAD' && await repo.getCurrentBranch().catch(() => 'HEAD') !== currentBranch) {
            await repo.checkout(currentBranch);
        }
    }
}

async function replaceCommitRangeOnBranch(repo: GitRepository, branch: string, newestHash: string, rewritten: string): Promise<void> {
    const branchTip = await repo.exec(['rev-parse', branch]);
    const currentBranch = await repo.getCurrentBranch();
    if (branchTip === newestHash) {
        if (branch === currentBranch) {
            await repo.exec(['reset', '--soft', rewritten]);
        } else {
            await repo.exec(['update-ref', `refs/heads/${branch}`, rewritten, newestHash]);
        }
        return;
    }
    await repo.exec(['rebase', '--autostash', '--onto', rewritten, newestHash, branch]);
}

function firstCommitMessageLine(message: string): string {
    return message.split(/\r?\n/)[0]?.trim() ?? '';
}

async function dropCommits(repo: GitRepository, hashes: readonly string[]): Promise<void> {
    await assertNoUnmergedFiles(repo, 'dropping commits');
    const choice = await showModalWarningMessage(`Drop ${hashes.length === 1 ? 'this commit' : `${hashes.length} commits`}?`, 'Drop');
    if (choice !== 'Drop') { return; }
    for (const hash of hashes) {
        await repo.exec(['rebase', '--autostash', '--onto', `${hash}^`, hash]);
    }
}

function openGitTerminal(cwd: string, command: string): void {
    const terminal = vscode.window.createTerminal({ name: 'Look Git', cwd });
    terminal.show();
    terminal.sendText(command);
}

async function pushAllUpToHere(repo: GitRepository, hash: string, remoteCommands: RemoteCommandBackend): Promise<void> {
    const remotes = await repo.getRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    const branch = await repo.getCurrentBranch();
    const choice = await showModalWarningMessage(`Push ${hash.substring(0, 7)} to ${remote}/${branch}?`, 'Push');
    if (choice !== 'Push') { return; }
    await remoteCommands.runCli(repo, {
        kind: CliRemoteCommandKind.Args,
        args: ['push', remote, `${hash}:refs/heads/${branch}`],
        title: `Look Git Remote: ${branch}`,
    });
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
