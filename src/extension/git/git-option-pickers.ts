import type { MergeOptions, PullOptions, RebaseOptions, StashOptions } from '@application/ports/git-capabilities';
import { PullStrategy } from '@application/ports/pull-strategy';
import { ResetMode } from '@application/ports/reset-mode';
import { CommitCreationMode } from '@extension/git/commit-creation-mode';
import { MergeStrategy } from '@application/ports/merge-strategy';
import { RebaseMode } from '@extension/git/rebase-mode';
import { StashMode } from '@extension/git/stash-mode';
import { pickAction } from '@extension/utils/pick-action';
import type * as vscode from 'vscode';
import { promptForCommitMessage } from '@extension/utils/commit-message-editor';

export async function pickPullOptions(placeHolder = 'Pull strategy'): Promise<PullOptions | undefined> {
    const strategy = await pickAction([
        { value: PullStrategy.Rebase, label: 'Pull (--rebase)', description: 'Replay local commits on top of upstream; keep a linear history' },
        { value: PullStrategy.Merge, label: 'Pull (--no-rebase)', description: 'Fast-forward when possible; create a merge commit when histories diverge' },
        { value: PullStrategy.FastForwardOnly, label: 'Pull (--ff-only)', description: 'Stop if local and upstream histories have diverged' },
        { value: PullStrategy.GitConfig, label: 'Pull (Git configuration)', description: 'Let Git resolve the strategy from the repository and user settings' },
    ], placeHolder);
    return strategy === undefined ? undefined : { strategy };
}

export async function pickMergeOptions(ref: string, extensionUri?: vscode.Uri, generateSquashMessage?: (signal: AbortSignal) => Promise<string>): Promise<MergeOptions | undefined> {
    const strategy = await pickAction([
        { value: MergeStrategy.FastForward, label: 'Fast-forward (--ff)', description: 'Fast-forward when possible; otherwise create a merge commit' },
        { value: MergeStrategy.NoFastForward, label: 'No-fast-forward (--no-ff)', description: 'Create a merge commit even when a fast-forward is possible' },
        { value: MergeStrategy.Squash, label: 'Squash (--squash)', description: 'Stage the combined changes for a single commit; keep the source branch unchanged' },
        { value: MergeStrategy.SquashNoFastForward, label: 'Squash + no-ff', description: 'Create a squash commit, then a merge commit; keep the source branch unchanged' },
        { value: MergeStrategy.FastForwardOnly, label: 'Fast-forward only (--ff-only)', description: 'Stop if the branches have diverged' },
    ], `Merge "${ref}"`);
    if (strategy === undefined) { return undefined; }
    if (strategy !== MergeStrategy.SquashNoFastForward) { return { strategy }; }
    const squashMessage = await promptForCommitMessage(`Squash branch '${ref}'`, 'Squash commit message', extensionUri, {
        generateMessage: generateSquashMessage,
        autoGenerate: true,
    });
    if (!squashMessage?.trim()) { return undefined; }
    const message = await promptForCommitMessage(`Merge branch '${ref}' (squashed)`, 'Merge commit message', extensionUri);
    if (!message?.trim()) { return undefined; }
    return { strategy, squashMessage: squashMessage.trim(), message: message.trim() };
}

export async function pickRebaseOptions(ref: string): Promise<RebaseOptions | undefined> {
    const mode = await pickAction([
        { value: RebaseMode.Rebase, label: 'Rebase', description: 'Replay commits on the target branch' },
        { value: RebaseMode.RebaseMerges, label: 'Rebase (--rebase-merges)', description: 'Recreate merge commits while rebasing' },
        { value: RebaseMode.Autostash, label: 'Rebase (--autostash)', description: 'Temporarily stash local changes and restore them after rebasing' },
        { value: RebaseMode.RebaseMergesAutostash, label: 'Rebase (--rebase-merges --autostash)', description: 'Recreate merges and temporarily stash local changes' },
    ], `Rebase onto "${ref}"`);
    if (mode === undefined) { return undefined; }
    return {
        rebaseMerges: mode === RebaseMode.RebaseMerges || mode === RebaseMode.RebaseMergesAutostash,
        autostash: mode === RebaseMode.Autostash || mode === RebaseMode.RebaseMergesAutostash,
    };
}

export function pickCommitCreationMode(placeHolder: string): Promise<CommitCreationMode | undefined> {
    return pickAction([
        { value: CommitCreationMode.Commit, label: placeHolder, description: 'Create a commit for each selected commit' },
        { value: CommitCreationMode.NoCommit, label: `${placeHolder} (--no-commit)`, description: 'Stage the resulting changes for review before committing' },
    ], placeHolder);
}

export async function pickStashOptions(): Promise<StashOptions | undefined> {
    const mode = await pickAction([
        { value: StashMode.Tracked, label: 'Stash', description: 'Stash staged and unstaged changes to tracked files' },
        { value: StashMode.IncludeUntracked, label: 'Stash (--include-untracked)', description: 'Also stash new files; ignored files are excluded' },
        { value: StashMode.Staged, label: 'Stash (--staged)', description: 'Stash only the staged changes' },
        { value: StashMode.KeepIndex, label: 'Stash (--keep-index)', description: 'Stash tracked changes while leaving staged changes in place' },
    ], 'Stash options');
    if (mode === undefined) { return undefined; }
    return {
        includeUntracked: mode === StashMode.IncludeUntracked,
        staged: mode === StashMode.Staged,
        keepIndex: mode === StashMode.KeepIndex,
    };
}

export function pickResetMode(): Promise<ResetMode | undefined> {
    return pickAction([
        { value: ResetMode.Soft, label: 'Reset (--soft)', description: 'Move the branch; keep changes staged' },
        { value: ResetMode.Mixed, label: 'Reset (--mixed)', description: 'Move the branch; keep changes unstaged' },
        { value: ResetMode.Hard, label: 'Reset (--hard)', description: 'Discard staged and working tree changes' },
        { value: ResetMode.Keep, label: 'Reset (--keep)', description: 'Move the branch while preserving local changes; stop on overlap' },
    ], 'Reset current branch to selected revision');
}
