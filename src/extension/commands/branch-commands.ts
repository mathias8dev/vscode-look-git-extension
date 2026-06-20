import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../application/ports/git-repository';
import { CliRemoteCommandKind, VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { CheckoutBranchUseCase } from '../../application/usecases/branches/checkout-branch';
import type { BranchCommand } from '../../protocol/graph/messages';
import type { GitWorktree } from '../../core/git/domain/GitWorktree';
import { showModalWarningMessage } from '../utils/confirmation';
import { showBranchNameInput } from '../utils/branch-name-input';
import {
    assertNoUnmergedFiles,
    compareRefWithPickedWorktree,
    openChangesBetweenMergeBaseAndRef,
    openChangesWithWorkingTree,
    promptNewWorktreePath,
} from './git-command-helpers';
import type { RuntimeCommandTargets } from './runtime-command-targets';

export async function runBranchCommand(
    repo: GitRepository,
    command: BranchCommand,
    branch: string,
    isRemote: boolean,
    remoteCommands: RemoteCommandBackend,
    checkoutBranch = new CheckoutBranchUseCase(),
    runtimeTargets: RuntimeCommandTargets = {},
): Promise<boolean> {
    const currentBranch = await repo.getCurrentBranch();
    switch (command) {
        case 'checkout':
            if (!isRemote && runtimeTargets.worktree) {
                await runtimeTargets.worktree.checkout(branch, {});
            } else {
                await checkoutBranch.execute(repo, { branch, isRemote });
            }
            return true;
        case 'newBranchFrom': {
            const name = await showBranchNameInput({
                prompt: `Create branch from "${branch}":`,
                value: isRemote ? localBranchNameForRemote(branch) : undefined,
            });
            if (!name) { return false; }
            if (runtimeTargets.worktree) { await runtimeTargets.worktree.checkoutNewBranch(name, branch); }
            else { await repo.checkoutNewBranch(name, branch); }
            return true;
        }
        case 'checkoutRebaseOnto':
            await assertNoUnmergedFiles(repo, 'checking out and rebasing branches');
            if (!isRemote && runtimeTargets.worktree) {
                await runtimeTargets.worktree.checkout(branch, {});
                await runtimeTargets.worktree.rebase(currentBranch, undefined, {});
            } else {
                await checkoutBranch.execute(repo, { branch, isRemote });
                await repo.exec(['rebase', currentBranch]);
            }
            return true;
        case 'newWorktreeFromBranch':
            return createWorktreeFromBranch(repo, branch, isRemote, runtimeTargets);
        case 'openBranchWorktree':
            await openBranchWorktree(repo, branch, isRemote);
            return false;
        case 'revealBranchWorktree':
            await revealBranchWorktree(repo, branch, isRemote);
            return false;
        case 'compareWithCurrent':
            await openChangesBetweenMergeBaseAndRef(repo, currentBranch, branch, `Diff ${currentBranch}...${branch}`);
            return false;
        case 'showDiffWithWorkingTree':
            await openChangesWithWorkingTree(repo, repo.cwd, branch, `Diff ${branch}..working tree`);
            return false;
        case 'compareBranchWithWorktree':
            await compareRefWithPickedWorktree(repo, branch, `Diff ${branch}`);
            return false;
        case 'showDiffWithBranchWorktree':
            await showDiffWithBranchWorktree(repo, branch, isRemote);
            return false;
        case 'delete': {
            if (!isRemote && branch === currentBranch) { throw new Error('The current branch cannot be deleted.'); }
            const label = `Delete${isRemote ? ' Remote' : ''}`;
            const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, label);
            if (choice !== label) { return false; }
            if (isRemote) {
                const { remote, branchName } = await resolveRemoteBranch(repo, branch);
                await repo.deleteRemoteBranch(remote, branchName);
            } else if (runtimeTargets.repository) {
                await runtimeTargets.repository.deleteBranch(branch, true);
            } else {
                await repo.deleteBranch(branch);
            }
            return true;
        }
        case 'rename': {
            const name = await showBranchNameInput({ prompt: `Rename "${branch}" to:`, value: branch });
            if (!name || name === branch) { return false; }
            if (runtimeTargets.repository) { await runtimeTargets.repository.renameBranch(branch, name); }
            else { await repo.renameBranch(branch, name); }
            return true;
        }
        case 'push':
            if (isRemote) { throw new Error('Push is only available for local branches.'); }
            await pushBranch(repo, branch, remoteCommands);
            return true;
        case 'pullBranchWorktree':
            await branchWorktreeGit(repo, branch, isRemote, ['pull'], remoteCommands);
            return true;
        case 'pushBranchWorktree':
            await pushBranchWorktree(repo, branch, isRemote, remoteCommands);
            return true;
        case 'lockBranchWorktree':
            await lockBranchWorktree(repo, branch, isRemote);
            return true;
        case 'unlockBranchWorktree':
            await unlockBranchWorktree(repo, branch, isRemote);
            return true;
        case 'removeBranchWorktree':
            return removeBranchWorktree(repo, branch, isRemote, runtimeTargets);
        case 'update': {
            if (isRemote) { throw new Error('Update selected branch is only available for local branches.'); }
            await updateSelectedLocalBranch(repo, branch, currentBranch, remoteCommands);
            return true;
        }
        case 'rebaseOnto':
            await assertNoUnmergedFiles(repo, 'rebasing branches');
            if (runtimeTargets.worktree) { await runtimeTargets.worktree.rebase(branch, undefined, {}); }
            else { await repo.rebase(branch); }
            return true;
        case 'planInteractiveRebaseOnto':
            return false;
        case 'mergeInto':
            await assertNoUnmergedFiles(repo, 'merging branches');
            if (runtimeTargets.worktree) { await runtimeTargets.worktree.merge(branch, {}); }
            else { await repo.merge(branch); }
            return true;
    }
}

async function createWorktreeFromBranch(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    runtimeTargets: RuntimeCommandTargets,
): Promise<boolean> {
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for "${branch}":`);
    if (!worktreePath) { return false; }
    const worktrees = await repo.listWorktrees();

    if (isRemote) {
        return createWorktreeFromRemoteBranch(repo, worktreePath, branch, worktrees, runtimeTargets);
    }

    if (worktreeForBranch(worktrees, branch)) {
        const branchName = await showBranchNameInput({
            prompt: `Branch "${branch}" is already checked out. New branch name for worktree:`,
            value: `${branch}-worktree`,
        });
        if (!branchName) { return false; }
        await addWorktree(repo, runtimeTargets, { path: worktreePath, branch: branchName, createNew: true, startPoint: branch });
        return true;
    }

    await addWorktree(repo, runtimeTargets, { path: worktreePath, branch });
    return true;
}

async function createWorktreeFromRemoteBranch(
    repo: GitRepository,
    worktreePath: string,
    remoteBranch: string,
    worktrees: readonly GitWorktree[],
    runtimeTargets: RuntimeCommandTargets,
): Promise<boolean> {
    const defaultLocalName = localNameForRemoteBranch(remoteBranch);
    const localBranches = (await repo.getAllBranches()).filter((branch) => !branch.isRemote).map((branch) => branch.name);

    if (localBranches.includes(defaultLocalName)) {
        if (!worktreeForBranch(worktrees, defaultLocalName)) {
            await addWorktree(repo, runtimeTargets, { path: worktreePath, branch: defaultLocalName });
            return true;
        }
        const branchName = await showBranchNameInput({
            prompt: `Branch "${defaultLocalName}" is already checked out. New branch name for worktree:`,
            value: `${defaultLocalName}-worktree`,
        });
        if (!branchName) { return false; }
        await addWorktree(repo, runtimeTargets, { path: worktreePath, branch: branchName, createNew: true, startPoint: remoteBranch });
        return true;
    }

    const branchName = await showBranchNameInput({
        prompt: `Local branch name for worktree from "${remoteBranch}":`,
        value: defaultLocalName,
    });
    if (!branchName) { return false; }
    if (localBranches.includes(branchName)) {
        if (worktreeForBranch(worktrees, branchName)) { throw new Error(`Branch "${branchName}" is already checked out in another worktree.`); }
        await addWorktree(repo, runtimeTargets, { path: worktreePath, branch: branchName });
        return true;
    }
    await addWorktree(repo, runtimeTargets, { path: worktreePath, branch: branchName, createNew: true, startPoint: remoteBranch });
    return true;
}

async function addWorktree(
    repo: GitRepository,
    runtimeTargets: RuntimeCommandTargets,
    input: { readonly path: string; readonly branch: string; readonly createNew?: boolean; readonly startPoint?: string },
): Promise<void> {
    if (runtimeTargets.repository) {
        await runtimeTargets.repository.addWorktree(input);
        return;
    }
    if (input.createNew) {
        await repo.exec(['worktree', 'add', '-b', input.branch, input.path, ...(input.startPoint ? [input.startPoint] : [])]);
        return;
    }
    await repo.exec(['worktree', 'add', input.path, input.branch]);
}

function localNameForRemoteBranch(branch: string): string {
    const slashIdx = branch.indexOf('/');
    return slashIdx === -1 ? branch : branch.substring(slashIdx + 1);
}

async function openBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    const choice = await vscode.window.showQuickPick(['Open in New Window', 'Open in Current Window'], { placeHolder: 'Open branch worktree' });
    if (!choice) { return; }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktree.path), { forceNewWindow: choice === 'Open in New Window' });
}

async function revealBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(worktree.path));
}

async function showDiffWithBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await openChangesWithWorkingTree(repo, worktree.path, branch, `Diff ${branch} with ${path.basename(worktree.path)}`);
}

async function branchWorktreeGit(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    args: readonly string[],
    remoteCommands: RemoteCommandBackend,
): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await remoteCommands.runCli(repo, {
        kind: CliRemoteCommandKind.Args,
        cwd: worktree.path,
        args,
        title: `Look Git Remote: ${branch}`,
    });
}

async function pushBranchWorktree(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    remoteCommands: RemoteCommandBackend,
): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    const upstream = (await repo.execRaw(['-C', worktree.path, 'for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    if (upstream) {
        const { remote, branchName } = await resolveRemoteBranch(repo, upstream);
        await remoteCommands.runCli(repo, {
            kind: CliRemoteCommandKind.Args,
            cwd: worktree.path,
            args: ['push', remote, `${branch}:refs/heads/${branchName}`],
            title: `Look Git Remote: ${branch}`,
        });
        return;
    }
    const remote = await defaultRemote(repo);
    await remoteCommands.runCli(repo, {
        kind: CliRemoteCommandKind.Args,
        cwd: worktree.path,
        args: ['push', '-u', remote, branch],
        title: `Look Git Remote: ${branch}`,
    });
}

async function lockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be locked.'); }
    await repo.exec(['worktree', 'lock', worktree.path]);
}

async function unlockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be unlocked.'); }
    await repo.exec(['worktree', 'unlock', worktree.path]);
}

async function removeBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean, runtimeTargets: RuntimeCommandTargets): Promise<boolean> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be removed.'); }
    const choice = await showModalWarningMessage(`Remove worktree at "${worktree.path}"?`, 'Remove');
    if (choice !== 'Remove') { return false; }
    if (runtimeTargets.repository) {
        await runtimeTargets.repository.removeWorktree(worktree.path, false);
    } else {
        await repo.removeWorktree(worktree.path, false);
    }
    return true;
}

async function requireWorktreeForBranch(repo: GitRepository, branch: string, isRemote: boolean): Promise<GitWorktree> {
    if (isRemote) { throw new Error('Remote branches do not have local worktrees.'); }
    const worktree = worktreeForBranch(await repo.listWorktrees(), branch);
    if (!worktree) { throw new Error(`No worktree is checked out for branch "${branch}".`); }
    return worktree;
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}

function worktreeForBranch(worktrees: readonly GitWorktree[], branch: string): GitWorktree | undefined {
    return worktrees.find((candidate) => shortWorktreeBranch(candidate.branch) === branch);
}

async function pushBranch(repo: GitRepository, branch: string, remoteCommands: RemoteCommandBackend): Promise<void> {
    const upstream = (await repo.execRaw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    if (upstream) {
        const { remote, branchName } = await resolveRemoteBranch(repo, upstream);
        await remoteCommands.runCli(repo, {
            kind: CliRemoteCommandKind.Args,
            args: ['push', remote, `${branch}:refs/heads/${branchName}`],
            title: `Look Git Remote: ${branch}`,
        });
        return;
    }
    const remote = await defaultRemote(repo);
    await remoteCommands.runCli(repo, {
        kind: CliRemoteCommandKind.Args,
        args: ['push', '-u', remote, branch],
        title: `Look Git Remote: ${branch}`,
    });
}

async function defaultRemote(repo: GitRepository): Promise<string> {
    const remotes = await repo.getRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    return remote;
}

async function resolveRemoteBranch(repo: GitRepository, branch: string): Promise<{ readonly remote: string; readonly branchName: string }> {
    const slashIdx = branch.indexOf('/');
    if (slashIdx === -1) {
        return { remote: await defaultRemote(repo), branchName: branch };
    }
    return {
        remote: branch.substring(0, slashIdx),
        branchName: branch.substring(slashIdx + 1),
    };
}

async function updateTargetForLocalBranch(repo: GitRepository, branch: string): Promise<{ readonly remote: string; readonly branchName: string }> {
    const upstream = (await repo.execRaw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    return resolveRemoteBranch(repo, upstream || branch);
}

async function updateSelectedLocalBranch(
    repo: GitRepository,
    branch: string,
    currentBranch: string,
    remoteCommands: RemoteCommandBackend,
): Promise<void> {
    const { remote, branchName } = await updateTargetForLocalBranch(repo, branch);
    await remoteCommands.runVscode(repo, VscodeRemoteCommand.FetchAll);
    const upstreamRef = `${remote}/${branchName}`;
    if (branch === currentBranch) {
        await repo.exec(['merge', '--ff-only', upstreamRef]);
        return;
    }
    await repo.exec(['merge-base', '--is-ancestor', branch, upstreamRef]);
    await repo.exec(['branch', '-f', branch, upstreamRef]);
}

function localBranchNameForRemote(branch: string): string | undefined {
    const slashIdx = branch.indexOf('/');
    return slashIdx === -1 ? undefined : branch.substring(slashIdx + 1);
}
