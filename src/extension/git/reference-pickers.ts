import { DivergedPushAction } from '@extension/git/diverged-push-action';
import { pickAction } from '@extension/utils/pick-action';
import * as vscode from 'vscode';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { showBranchNameInput } from '@extension/utils/branch-name-input';

const UPDATE_BRANCH = 'Update Branch';
const CHECKOUT_BRANCH = 'Check Out Branch';
const FORCE_PUSH_WITH_LEASE = 'Force Push with Lease';
const FORCE_PUSH = 'Force Push';
const MORE_PUSH_ACTIONS = 'More Push Actions...';

export async function inputText(placeHolder: string, value?: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ placeHolder, value });
    const trimmed = input?.trim();
    return trimmed || undefined;
}

export async function inputBranchName(placeHolder: string, value?: string): Promise<string | undefined> {
    return showBranchNameInput({ placeHolder, value });
}

export async function pickBranch(placeHolder: string, repository: GitRepository): Promise<string | undefined> {
    const branches = await repository.listBranches();
    return vscode.window.showQuickPick(branches.map((branch) => branch.name), { placeHolder });
}

export async function pickRemoteBranch(placeHolder: string, repository: GitRepository): Promise<string | undefined> {
    const branches = (await repository.listRemoteBranches())
        .filter((branch) => branch.isRemote)
        .map((branch) => branch.name);
    return vscode.window.showQuickPick(branches, { placeHolder });
}

export async function pickLocalBranch(
    placeHolder: string,
    repository: GitRepository,
    preferred?: string,
): Promise<string | undefined> {
    const branches = (await repository.listBranches())
        .filter((branch) => !branch.isRemote)
        .map((branch) => branch.name);
    const ordered = preferred && branches.includes(preferred)
        ? [preferred, ...branches.filter((branch) => branch !== preferred)]
        : branches;
    return vscode.window.showQuickPick(ordered, { placeHolder });
}

export async function pickRemote(placeHolder: string, repository: GitRepository, signal?: AbortSignal): Promise<string | undefined> {
    const remotes = await repository.listRemotes(signal);
    if (remotes.length === 0) { throw new Error('No Git remotes are configured.'); }
    if (remotes.length === 1) { return remotes[0]; }
    const remote = await vscode.window.showQuickPick(remotes, { placeHolder });
    signal?.throwIfAborted();
    return remote;
}

export async function pickRef(placeHolder: string, repository: GitRepository): Promise<string | undefined> {
    const [branches, tags] = await Promise.all([
        repository.listBranches(),
        repository.listTags(),
    ]);
    return vscode.window.showQuickPick([
        ...branches.map((branch) => branch.name),
        ...tags.map((tag) => tag.name),
    ], { placeHolder });
}

export async function pickTag(placeHolder: string, repository: GitRepository): Promise<string | undefined> {
    const tags = await repository.listTags();
    return vscode.window.showQuickPick(tags.map((tag) => tag.name), { placeHolder });
}

export async function confirmBehindBranchUpdate(branch: string, upstream: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        `"${branch}" is behind "${upstream}". Update it before pushing.`,
        UPDATE_BRANCH,
    );
    return choice === UPDATE_BRANCH;
}

export async function pickDivergedPushAction(
    branch: string,
    upstream: string,
    canUpdate: boolean,
): Promise<DivergedPushAction | undefined> {
    const recovery = canUpdate ? DivergedPushAction.Update : DivergedPushAction.Checkout;
    const recoveryLabel = canUpdate ? UPDATE_BRANCH : CHECKOUT_BRANCH;
    const choice = await pickAction([
        { value: recovery, label: recoveryLabel, description: recovery === DivergedPushAction.Update ? 'Choose how to integrate upstream changes' : 'Switch to this branch before updating it' },
        { value: DivergedPushAction.ForceWithLease, label: FORCE_PUSH_WITH_LEASE, description: 'Replace remote history only if it has not changed since the last fetch' },
        { value: DivergedPushAction.Force, label: MORE_PUSH_ACTIONS, description: 'Show the unprotected force push confirmation' },
    ], `"${branch}" has diverged from "${upstream}"`);
    if (choice !== DivergedPushAction.Force) { return choice; }
    const forceChoice = await vscode.window.showWarningMessage(
        `Force push "${branch}"? This can overwrite commits on "${upstream}".`,
        { modal: true },
        FORCE_PUSH,
    );
    return forceChoice === FORCE_PUSH ? DivergedPushAction.Force : undefined;
}

export async function pickStash(placeHolder: string, worktree: Worktree): Promise<number | undefined> {
    const stashes = (await worktree.listStashes({ limit: Number.MAX_SAFE_INTEGER })).items;
    const items = stashes.map((stash) => `stash@{${stash.index}} ${stash.message}`);
    const selected = await vscode.window.showQuickPick(items, { placeHolder });
    if (!selected) { return undefined; }
    const match = selected.match(/^stash@\{(\d+)\}/);
    return match ? Number(match[1]) : undefined;
}
