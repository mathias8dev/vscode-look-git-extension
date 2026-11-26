import { GitPushOutcome, type PushOptions } from '@application/ports/git-capabilities';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { CheckoutBranchUseCase } from '@application/usecases/branches/checkout-branch';
import type { GitBranch } from '@core/git/domain/git-status';
import { commandExecutionResult, pushCommandExecutionResult, type CommandExecutionResult } from '@extension/commands/command-execution-result';
import { requireRuntimeWorktree, type RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';
import { DivergedPushAction } from '@extension/git/diverged-push-action';
import { currentBranchName } from '@extension/git/current-branch';
import { isNonFastForwardPushError } from '@extension/git/git-error';
import { pickPullOptions } from '@extension/git/git-option-pickers';
import { confirmBehindBranchUpdate, pickDivergedPushAction } from '@extension/git/reference-pickers';

export async function pushWithRecovery(
    repository: GitRepository,
    worktree: Worktree,
    branch?: string,
    signal?: AbortSignal,
): Promise<GitPushOutcome> {
    try {
        return branch === undefined
            ? await worktree.push(undefined, {}, signal)
            : await worktree.pushBranch(undefined, branch, {}, signal);
    } catch (error) {
        if (!isNonFastForwardPushError(error)) { throw error; }
        await repository.fetchAll({}, signal);
        const currentBranch = await currentBranchName(repository, undefined, signal);
        const state = await localBranchState(repository, branch ?? currentBranch, signal);
        if (!state?.upstream || state.behind === 0) { throw error; }
        const recovery = await resolvePushRecovery(repository, { repository, worktree, worktrees: [worktree] }, new CheckoutBranchUseCase(), state, currentBranch, signal);
        return recovery.pushOutcome ?? (recovery.shouldRefresh ? GitPushOutcome.NotPushed : GitPushOutcome.Cancelled);
    }
}

async function pushBranch(runtimeTargets: RuntimeCommandTargets, branch: string, options: PushOptions, signal?: AbortSignal): Promise<GitPushOutcome> {
    return requireRuntimeWorktree(runtimeTargets).pushBranch(undefined, branch, options, signal);
}

export async function pushSelectedBranch(
    repository: GitRepository,
    runtimeTargets: RuntimeCommandTargets,
    checkoutBranch: CheckoutBranchUseCase,
    branch: string,
    currentBranch: string,
    signal?: AbortSignal,
): Promise<CommandExecutionResult> {
    const branchState = await localBranchState(repository, branch, signal);
    if (branchState?.upstream && branchState.behind > 0) {
        return resolvePushRecovery(repository, runtimeTargets, checkoutBranch, branchState, currentBranch, signal);
    }
    try {
        const outcome = await pushBranch(runtimeTargets, branch, {}, signal);
        return pushCommandExecutionResult(outcome);
    } catch (error) {
        if (!isNonFastForwardPushError(error)) { throw error; }
        await repository.fetchAll({}, signal);
        const refreshedState = await localBranchState(repository, branch, signal);
        if (!refreshedState?.upstream || refreshedState.behind === 0) { throw error; }
        const recovery = await resolvePushRecovery(repository, runtimeTargets, checkoutBranch, refreshedState, currentBranch, signal);
        return commandExecutionResult(true, recovery.pushOutcome);
    }
}

async function localBranchState(repository: GitRepository, branch: string, signal?: AbortSignal): Promise<GitBranch | undefined> {
    return (await repository.listBranches(signal)).find((candidate) => !candidate.isRemote && candidate.name === branch);
}

async function resolvePushRecovery(
    repository: GitRepository,
    runtimeTargets: RuntimeCommandTargets,
    checkoutBranch: CheckoutBranchUseCase,
    branchState: GitBranch,
    currentBranch: string,
    signal?: AbortSignal,
): Promise<CommandExecutionResult> {
    const branch = branchState.name;
    const upstream = branchState.upstream;
    if (!upstream) { return commandExecutionResult(false); }
    if (branchState.ahead === 0) {
        if (!await confirmBehindBranchUpdate(branch, upstream)) { return commandExecutionResult(false); }
        return commandExecutionResult(await updateSelectedLocalBranch(repository, requireRuntimeWorktree(runtimeTargets), runtimeTargets, branch, currentBranch, signal));
    }
    const canUpdate = branch === currentBranch || runtimeWorktreeForBranch(runtimeTargets.worktrees ?? [], branch) !== undefined;
    const action = await pickDivergedPushAction(branch, upstream, canUpdate);
    signal?.throwIfAborted();
    switch (action) {
        case DivergedPushAction.Update:
            return commandExecutionResult(await updateSelectedLocalBranch(repository, requireRuntimeWorktree(runtimeTargets), runtimeTargets, branch, currentBranch, signal));
        case DivergedPushAction.Checkout:
            await checkoutBranch.execute(repository, requireRuntimeWorktree(runtimeTargets), { branch, isRemote: false });
            return commandExecutionResult(true);
        case DivergedPushAction.ForceWithLease: {
            const outcome = await pushBranch(runtimeTargets, branch, { forceWithLease: true }, signal);
            return pushCommandExecutionResult(outcome);
        }
        case DivergedPushAction.Force: {
            const outcome = await pushBranch(runtimeTargets, branch, { force: true }, signal);
            return pushCommandExecutionResult(outcome);
        }
        case undefined:
            return commandExecutionResult(false);
    }
}

export async function updateSelectedLocalBranch(
    repository: GitRepository,
    worktree: Worktree,
    runtimeTargets: RuntimeCommandTargets,
    branch: string,
    currentBranch: string,
    signal?: AbortSignal,
): Promise<boolean> {
    const upstream = await repository.getUpstreamBranch(branch, signal);
    if (!upstream) { throw new Error(`Branch "${branch}" has no upstream.`); }
    const branchWorktree = branch === currentBranch ? worktree : runtimeWorktreeForBranch(runtimeTargets.worktrees ?? [], branch);
    if (branchWorktree) {
        const options = await pickPullOptions(`Pull "${branch}" from "${upstream}"`);
        if (!options) { return false; }
        await branchWorktree.pull(options, signal);
        return true;
    }
    await repository.fetchAll({}, signal);
    const { ahead, behind } = await repository.getAheadBehind(branch, upstream, signal);
    if (behind === 0) { return true; }
    if (ahead > 0) {
        throw new Error(`Branch "${branch}" and "${upstream}" have diverged. Check out the branch or update its worktree to merge or rebase it.`);
    }
    await repository.updateRef(localBranchRef(branch), await repository.resolveRef(upstream, signal), signal);
    return true;
}

function runtimeWorktreeForBranch(worktrees: readonly Worktree[], branch: string): Worktree | undefined {
    return worktrees.find((candidate) => shortWorktreeBranch(candidate.branch) === branch);
}

function localBranchRef(branch: string): string {
    return branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`;
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}
