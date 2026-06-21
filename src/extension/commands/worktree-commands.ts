import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '@application/ports/git-topology';
import type { WorktreeCommand } from '@protocol/graph/messages';
import { showModalWarningMessage } from '@extension/utils/confirmation';
import { showBranchNameInput } from '@extension/utils/branch-name-input';
import { openChangesWithWorkingTree } from '@extension/commands/git-command-helpers';
import { requireRuntimeRepository, requireRuntimeTargets, requireRuntimeWorktree, type RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';


export async function runWorktreeCommand(
    repo: GitRepository,
    command: WorktreeCommand,
    wtPath: string | undefined,
    runtimeTargets: RuntimeCommandTargets = {},
): Promise<boolean> {
    const runtimeRepository = requireRuntimeRepository(runtimeTargets);
    switch (command) {
        case 'open': {
            const pathValue = requireWorktreePath(wtPath);
            const choice = await vscode.window.showQuickPick(['Open in New Window', 'Open in Current Window'], { placeHolder: 'Open worktree' });
            if (!choice) { return false; }
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(pathValue), { forceNewWindow: choice === 'Open in New Window' });
            return false;
        }
        case 'openInNewWindow':
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(requireWorktreePath(wtPath)), { forceNewWindow: true });
            return false;
        case 'reveal':
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(requireWorktreePath(wtPath)));
            return false;
        case 'showDiffWithHead': {
            const pathValue = requireWorktreePath(wtPath);
            await openChangesWithWorkingTree(repo, pathValue, 'HEAD', `Diff ${path.basename(pathValue)} with HEAD`);
            return false;
        }
        case 'showDiffWithMainWorktree':
            await showDiffWithMainWorktree(repo, requireWorktreePath(wtPath));
            return false;
        case 'fetch':
            await runtimeRepository.fetchAll({});
            return true;
        case 'pull':
            await requireRuntimeWorktree(runtimeTargets).pull({});
            return true;
        case 'push':
            await requireRuntimeWorktree(runtimeTargets).push(undefined, {});
            return true;
        case 'commit':
            return commitWorktree(repo, requireWorktreePath(wtPath), runtimeTargets);
        case 'stash':
            return stashWorktree(repo, requireWorktreePath(wtPath), runtimeTargets);
        case 'newBranch': {
            const branch = await showBranchNameInput({ prompt: 'New branch from worktree HEAD:' });
            if (!branch) { return false; }
            await requireRuntimeWorktree(runtimeTargets).checkoutNewBranch(branch, undefined);
            return true;
        }
        case 'checkoutBranch': {
            const branchList = await runtimeRepository.listBranches();
            const branches = branchList.filter((branch) => !branch.isRemote).map((branch) => branch.name);
            const branch = await vscode.window.showQuickPick(branches, { placeHolder: 'Checkout branch in worktree' });
            if (!branch) { return false; }
            await requireRuntimeWorktree(runtimeTargets).checkout(branch, {});
            return true;
        }
        case 'lock':
            await assertNotMainWorktree(runtimeRepository, requireWorktreePath(wtPath), 'locked');
            await runtimeRepository.lockWorktree(requireWorktreePath(wtPath));
            return true;
        case 'unlock':
            await assertNotMainWorktree(runtimeRepository, requireWorktreePath(wtPath), 'unlocked');
            await runtimeRepository.unlockWorktree(requireWorktreePath(wtPath));
            return true;
        case 'add': {
            const p = await vscode.window.showInputBox({ prompt: 'Worktree path (absolute):' });
            if (!p) { return false; }
            const b = await showBranchNameInput({ prompt: 'Branch name:' });
            if (!b) { return false; }
            const branches = await runtimeRepository.listBranches();
            const createNew = !branches.some((br) => br.name === b);
            await runtimeRepository.addWorktree({ path: p, branch: b, createNew });
            return true;
        }
        case 'remove':
        case 'removeForce': {
            const pathValue = requireWorktreePath(wtPath);
            await assertNotMainWorktree(runtimeRepository, pathValue, 'removed');
            const force = command === 'removeForce';
            if (force) {
                const choice = await showModalWarningMessage(`Force remove worktree at "${pathValue}"?`, 'Force Remove');
                if (choice !== 'Force Remove') { return false; }
                const destructiveChoice = await showModalWarningMessage('Uncommitted changes in this worktree will be permanently lost.', 'Discard Changes and Remove');
                if (destructiveChoice !== 'Discard Changes and Remove') { return false; }
            } else {
                const choice = await showModalWarningMessage(`Remove worktree at "${pathValue}"?`, 'Remove');
                if (choice !== 'Remove') { return false; }
            }
            await runtimeRepository.removeWorktree(pathValue, force);
            return true;
        }
    }
}

function requireWorktreePath(wtPath: string | undefined): string {
    if (!wtPath) { throw new Error('Worktree path is required.'); }
    return wtPath;
}

async function assertNotMainWorktree(repo: GitRepository, wtPath: string, operation: 'locked' | 'unlocked' | 'removed'): Promise<void> {
    const worktree = (await repo.listWorktrees()).find((candidate) => candidate.path === wtPath);
    if (worktree?.isMain) { throw new Error(`The main worktree cannot be ${operation}.`); }
}

async function showDiffWithMainWorktree(repo: GitRepository, wtPath: string): Promise<void> {
    const worktrees = await repo.listWorktrees();
    const main = worktrees.find((worktree) => worktree.isMain);
    const selected = worktrees.find((worktree) => worktree.path === wtPath);
    if (!main) { throw new Error('Main worktree not found.'); }
    if (!selected) { throw new Error(`Unknown worktree: ${wtPath}`); }
    if (selected.isMain) { throw new Error('Cannot compare the main worktree with itself.'); }
    await openChangesWithWorkingTree(repo, wtPath, main.head, `Diff ${path.basename(wtPath)} with ${path.basename(main.path)}`);
}

async function commitWorktree(_repo: GitRepository, _wtPath: string, runtimeTargets: RuntimeCommandTargets): Promise<boolean> {
    const worktree = requireRuntimeTargets(runtimeTargets).worktree;
    const status = await worktree.getStatus();
    if (status.conflicts.length > 0) { throw new Error('Resolve conflicts before committing this worktree.'); }
    if (status.staged.length === 0 && status.unstaged.length === 0) { throw new Error('No changes to commit in this worktree.'); }

    if (status.staged.length === 0) {
        const choice = await showModalWarningMessage('No staged changes in this worktree. Stage all changes and commit?', 'Stage All and Commit');
        if (choice !== 'Stage All and Commit') { return false; }
        await worktree.stageAll();
    } else if (status.unstaged.length > 0) {
        const choice = await vscode.window.showQuickPick(['Commit Staged Changes', 'Stage All and Commit'], { placeHolder: 'This worktree also has unstaged changes.' });
        if (!choice) { return false; }
        if (choice === 'Stage All and Commit') {
            await worktree.stageAll();
        }
    }

    const message = await vscode.window.showInputBox({ prompt: 'Commit message:' });
    if (!message?.trim()) { return false; }
    await worktree.commit(message, {});
    return true;
}

async function stashWorktree(_repo: GitRepository, _wtPath: string, runtimeTargets: RuntimeCommandTargets): Promise<boolean> {
    const message = await vscode.window.showInputBox({ prompt: 'Stash message:', placeHolder: 'Optional' });
    if (message === undefined) { return false; }
    await requireRuntimeWorktree(runtimeTargets).stash(message.trim() || undefined, { includeUntracked: true });
    return true;
}
