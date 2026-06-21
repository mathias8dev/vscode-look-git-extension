import * as vscode from 'vscode';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { showBranchNameInput } from '@extension/utils/branch-name-input';

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

export async function pickRemote(placeHolder: string, repository: GitRepository): Promise<string | undefined> {
    const remotes = await repository.listRemotes();
    if (remotes.length === 1) { return remotes[0]; }
    return vscode.window.showQuickPick(remotes, { placeHolder });
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

export async function pickStash(placeHolder: string, worktree: Worktree): Promise<number | undefined> {
    const stashes = (await worktree.listStashes({ limit: Number.MAX_SAFE_INTEGER })).items;
    const items = stashes.map((stash) => `stash@{${stash.index}} ${stash.message}`);
    const selected = await vscode.window.showQuickPick(items, { placeHolder });
    if (!selected) { return undefined; }
    const match = selected.match(/^stash@\{(\d+)\}/);
    return match ? Number(match[1]) : undefined;
}
