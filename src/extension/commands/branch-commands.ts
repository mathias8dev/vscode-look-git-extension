import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../application/ports/git-repository';
import type { GitFetchOperations, GitMergeOperations, GitReferenceOperations, GitStatusOperations, GitWorktreeTopologyOperations } from '../../application/ports/git-capabilities';
import { CheckoutBranchUseCase } from '../../application/usecases/branches/checkout-branch';
import type { BranchCommand } from '../../protocol/graph/messages';
import type { GitWorktree } from '../../core/git/domain/GitWorktree';
import { showModalWarningMessage } from '../utils/confirmation';
import { showBranchNameInput } from '../utils/branch-name-input';
import {
    compareRefWithPickedWorktree,
    openChangesBetweenMergeBaseAndRef,
    openChangesWithWorkingTree,
    promptNewWorktreePath,
} from './git-command-helpers';
import { requireRuntimeRepository, requireRuntimeWorktree, requireRuntimeWorktreePath, type RuntimeCommandTargets } from './runtime-command-targets';

type BranchRemoteLookup = Pick<GitReferenceOperations, 'listRemotes'>;
type BranchUpdateRepository = Pick<GitFetchOperations & GitReferenceOperations, 'fetchAll' | 'getUpstreamBranch'>;
type BranchMergeWorktree = Pick<GitMergeOperations, 'merge'>;
type BranchWorktreeLockRepository = Pick<GitWorktreeTopologyOperations, 'lockWorktree' | 'unlockWorktree'>;
type BranchStatusWorktree = Pick<GitStatusOperations, 'getStatus'>;

export async function runBranchCommand(
    repo: GitRepository,
    command: BranchCommand,
    branch: string,
    isRemote: boolean,
    checkoutBranch = new CheckoutBranchUseCase(),
    runtimeTargets: RuntimeCommandTargets = {},
): Promise<boolean> {
    const runtimeRepository = requireRuntimeRepository(runtimeTargets);
    const currentBranch = await currentBranchName(runtimeRepository);
    switch (command) {
        case 'checkout':
            await checkoutBranch.execute(
                { checkout: (ref, opts) => requireRuntimeWorktree(runtimeTargets).checkout(ref, opts), listBranches: () => runtimeRepository.listBranches() },
                { branch, isRemote },
            );
            return true;
        case 'newBranchFrom': {
            const name = await showBranchNameInput({
                prompt: `Create branch from "${branch}":`,
                value: isRemote ? localBranchNameForRemote(branch) : undefined,
            });
            if (!name) { return false; }
            await requireRuntimeWorktree(runtimeTargets).checkoutNewBranch(name, branch);
            return true;
        }
        case 'checkoutRebaseOnto':
            await assertRuntimeNoUnmergedFiles(requireRuntimeWorktree(runtimeTargets), 'checking out and rebasing branches');
            await checkoutBranch.execute(
                { checkout: (ref, opts) => requireRuntimeWorktree(runtimeTargets).checkout(ref, opts), listBranches: () => runtimeRepository.listBranches() },
                { branch, isRemote },
            );
            await requireRuntimeWorktree(runtimeTargets).rebase(currentBranch, undefined, {});
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
                const { remote, branchName } = await resolveRemoteBranch(runtimeRepository, branch);
                await runtimeRepository.deleteRemoteBranch(remote, branchName);
            } else {
                await runtimeRepository.deleteBranch(branch, true);
            }
            return true;
        }
        case 'rename': {
            const name = await showBranchNameInput({ prompt: `Rename "${branch}" to:`, value: branch });
            if (!name || name === branch) { return false; }
            await runtimeRepository.renameBranch(branch, name);
            return true;
        }
        case 'push':
            if (isRemote) { throw new Error('Push is only available for local branches.'); }
            await pushBranch(runtimeTargets, branch);
            return true;
        case 'pullBranchWorktree':
            await pullBranchWorktree(repo, branch, isRemote, runtimeTargets);
            return true;
        case 'pushBranchWorktree':
            await pushBranchWorktree(repo, branch, isRemote, runtimeTargets);
            return true;
        case 'lockBranchWorktree':
            await lockBranchWorktree(repo, branch, isRemote, runtimeRepository);
            return true;
        case 'unlockBranchWorktree':
            await unlockBranchWorktree(repo, branch, isRemote, runtimeRepository);
            return true;
        case 'removeBranchWorktree':
            return removeBranchWorktree(repo, branch, isRemote, runtimeTargets);
        case 'update': {
            if (isRemote) { throw new Error('Update selected branch is only available for local branches.'); }
            await updateSelectedLocalBranch(runtimeRepository, requireRuntimeWorktree(runtimeTargets), branch, currentBranch);
            return true;
        }
        case 'rebaseOnto':
            await assertRuntimeNoUnmergedFiles(requireRuntimeWorktree(runtimeTargets), 'rebasing branches');
            await requireRuntimeWorktree(runtimeTargets).rebase(branch, undefined, {});
            return true;
        case 'planInteractiveRebaseOnto':
            return false;
        case 'mergeInto':
            await assertRuntimeNoUnmergedFiles(requireRuntimeWorktree(runtimeTargets), 'merging branches');
            await requireRuntimeWorktree(runtimeTargets).merge(branch, {});
            return true;
    }
}

async function createWorktreeFromBranch(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    runtimeTargets: RuntimeCommandTargets,
): Promise<boolean> {
    const runtimeRepository = requireRuntimeRepository(runtimeTargets);
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for "${branch}":`);
    if (!worktreePath) { return false; }
    const worktrees = await runtimeRepository.listWorktrees();

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
    const localBranches = (await requireRuntimeRepository(runtimeTargets).listBranches()).filter((branch) => !branch.isRemote).map((branch) => branch.name);

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
    _repo: GitRepository,
    runtimeTargets: RuntimeCommandTargets,
    input: { readonly path: string; readonly branch: string; readonly createNew?: boolean; readonly startPoint?: string },
): Promise<void> {
    await requireRuntimeRepository(runtimeTargets).addWorktree(input);
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

async function pullBranchWorktree(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    runtimeTargets: RuntimeCommandTargets,
): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    await requireRuntimeWorktreePath(runtimeTargets, worktree.path).pull({});
}

async function pushBranchWorktree(
    repo: GitRepository,
    branch: string,
    isRemote: boolean,
    runtimeTargets: RuntimeCommandTargets,
): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    const runtimeRepository = requireRuntimeRepository(runtimeTargets);
    const upstream = await runtimeRepository.getUpstreamBranch(branch);
    const remote = upstream ? requireRemoteBranchName(upstream).remote : await defaultRemote(runtimeRepository);
    await requireRuntimeWorktreePath(runtimeTargets, worktree.path).pushBranch(remote, branch, { setUpstream: !upstream });
}

async function lockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean, runtimeRepository: BranchWorktreeLockRepository): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be locked.'); }
    await runtimeRepository.lockWorktree(worktree.path);
}

async function unlockBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean, runtimeRepository: BranchWorktreeLockRepository): Promise<void> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be unlocked.'); }
    await runtimeRepository.unlockWorktree(worktree.path);
}

async function removeBranchWorktree(repo: GitRepository, branch: string, isRemote: boolean, runtimeTargets: RuntimeCommandTargets): Promise<boolean> {
    const worktree = await requireWorktreeForBranch(repo, branch, isRemote);
    if (worktree.isMain) { throw new Error('The main worktree cannot be removed.'); }
    const choice = await showModalWarningMessage(`Remove worktree at "${worktree.path}"?`, 'Remove');
    if (choice !== 'Remove') { return false; }
    await requireRuntimeRepository(runtimeTargets).removeWorktree(worktree.path, false);
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

async function pushBranch(runtimeTargets: RuntimeCommandTargets, branch: string): Promise<void> {
    const runtimeRepository = requireRuntimeRepository(runtimeTargets);
    const upstream = await runtimeRepository.getUpstreamBranch(branch);
    const remote = upstream ? requireRemoteBranchName(upstream).remote : await defaultRemote(runtimeRepository);
    await requireRuntimeWorktree(runtimeTargets).pushBranch(remote, branch, { setUpstream: !upstream });
}

async function defaultRemote(repo: BranchRemoteLookup): Promise<string> {
    const remotes = await repo.listRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    return remote;
}

async function resolveRemoteBranch(repo: BranchRemoteLookup, branch: string): Promise<{ readonly remote: string; readonly branchName: string }> {
    const parsed = resolveRemoteBranchName(branch);
    if (parsed) { return parsed; }
    return { remote: await defaultRemote(repo), branchName: branch };
}

function resolveRemoteBranchName(branch: string): { readonly remote: string; readonly branchName: string } | undefined {
    const slashIdx = branch.indexOf('/');
    if (slashIdx === -1) { return undefined; }
    return {
        remote: branch.substring(0, slashIdx),
        branchName: branch.substring(slashIdx + 1),
    };
}

function requireRemoteBranchName(branch: string): { readonly remote: string; readonly branchName: string } {
    const parsed = resolveRemoteBranchName(branch);
    if (!parsed) { throw new Error(`Expected remote branch name, got "${branch}".`); }
    return parsed;
}

async function updateSelectedLocalBranch(
    repository: BranchUpdateRepository,
    worktree: BranchMergeWorktree,
    branch: string,
    currentBranch: string,
): Promise<void> {
    const upstream = await repository.getUpstreamBranch(branch);
    if (!upstream) { throw new Error(`Branch "${branch}" has no upstream.`); }
    await repository.fetchAll({});
    if (branch !== currentBranch) {
        throw new Error('Updating a non-current branch is not implemented through semantic git operations yet.');
    }
    await worktree.merge(upstream, {});
}

async function currentBranchName(repository: Pick<GitReferenceOperations, 'listBranches'>): Promise<string> {
    return (await repository.listBranches()).find((branch) => branch.isCurrent)?.name ?? 'HEAD';
}

async function assertRuntimeNoUnmergedFiles(worktree: BranchStatusWorktree, operation: string): Promise<void> {
    const status = await worktree.getStatus();
    if (status.conflicts.length > 0) {
        throw new Error(`Resolve existing conflicts before ${operation}.`);
    }
}

function localBranchNameForRemote(branch: string): string | undefined {
    const slashIdx = branch.indexOf('/');
    return slashIdx === -1 ? undefined : branch.substring(slashIdx + 1);
}
