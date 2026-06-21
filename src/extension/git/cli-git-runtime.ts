import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Page } from '@core/git/domain/page';
import type { GitExec } from '@extension/git/git-exec';
import { queryAllBranches, queryAllTags, queryCommitFiles, queryCommitLineRangeLog, queryCommitLog, queryCommitMessage, queryCurrentBranch, queryGraphLog } from '@extension/git/queries/query-graph';
import { queryStatus, queryStashList } from '@extension/git/queries/query-status';
import { parseNameStatusZ } from '@core/parsing/parse-name-status';
import { querySubmoduleStatus, updateSubmodule } from '@extension/git/queries/query-submodules';
import { addWorktree, queryWorktrees, removeWorktree } from '@extension/git/queries/query-worktrees';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { CommitGraphQuery } from '@application/ports/git-capabilities';
import { requireRemoteBranchName } from '@extension/git/remote-branch';

interface CliInvocation {
    readonly args: readonly string[];
    readonly trim?: boolean;
}

export interface CliGitRuntimeProcessOptions {
    readonly signal?: AbortSignal;
    readonly env?: Readonly<Record<string, string>>;
}

export type CliGitRuntimeProcess = (
    args: readonly string[],
    context: GitExecutionContext,
    options: CliGitRuntimeProcessOptions,
) => Promise<string>;

export class CliGitRuntime implements GitRuntime {
    constructor(
        private readonly runProcess: CliGitRuntimeProcess,
    ) {}

    supports(operation: SemanticGitOperation): boolean {
        return operation in CLI_INVOCATIONS || operation in CLI_HANDLERS;
    }

    async execute<TInput = unknown, TResult = unknown>(
        operation: SemanticGitOperation,
        context: GitExecutionContext,
        input: TInput,
        signal?: AbortSignal,
    ): Promise<TResult> {
        const handler = CLI_HANDLERS[operation];
        if (handler) {
            return await handler(input, this.runProcess, context, signal) as TResult;
        }

        const buildInvocation = CLI_INVOCATIONS[operation];
        if (!buildInvocation) {
            throw new UnsupportedGitOperationError(operation, context);
        }

        const invocation = buildInvocation(input);
        const output = await this.runProcess(invocation.args, context, { signal });
        return resultFor(operation, invocation.trim === false ? output : output.trim()) as TResult;
    }
}

type CliInvocationBuilder = (input: unknown) => CliInvocation;
type CliSemanticHandler = (
    input: unknown,
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
) => Promise<unknown>;

const CLI_INVOCATIONS: Partial<Record<SemanticGitOperation, CliInvocationBuilder>> = {
    listRemotes: () => ({ args: ['remote'] }),
    resolveRef: (input) => ({ args: ['rev-parse', requiredString(input, 'ref')] }),
    fetch: (input) => ({ args: withOptionalRemote(['fetch'], optionalStringField(input, 'remote')) }),
    fetchAll: () => ({ args: ['fetch', '--all'] }),
    pruneRemote: (input) => ({ args: ['remote', 'prune', requiredString(input, 'remote')] }),
    getRemoteUrl: (input) => ({ args: ['remote', 'get-url', requiredString(input, 'remote')] }),
    setRemoteUrl: (input) => ({ args: ['remote', 'set-url', requiredStringField(input, 'remote'), requiredStringField(input, 'url')] }),
    addRemote: (input) => ({ args: ['remote', 'add', requiredStringField(input, 'name'), requiredStringField(input, 'url')] }),
    removeRemote: (input) => ({ args: ['remote', 'remove', requiredString(input, 'remote')] }),
    getFileAtRevision: (input) => ({ args: ['show', `${requiredStringField(input, 'revision')}:${requiredStringField(input, 'path')}`], trim: false }),
    getFileFromIndex: (input) => ({ args: ['show', `:${requiredStringField(input, 'path')}`], trim: false }),
    createBranch: (input) => ({ args: createBranchArgs(input) }),
    renameBranch: (input) => ({ args: ['branch', '-m', requiredStringField(input, 'oldName'), requiredStringField(input, 'newName')] }),
    deleteBranch: (input) => ({ args: deleteBranchArgs(input) }),
    setUpstream: (input) => ({ args: ['branch', '--set-upstream-to', requiredStringField(input, 'upstream'), requiredStringField(input, 'branch')] }),
    createTag: (input) => ({ args: createTagArgs(input) }),
    deleteTag: (input) => ({ args: ['tag', '-d', requiredStringField(input, 'name')] }),
    stage: (input) => ({ args: ['add', '--', ...requiredStringArrayField(input, 'paths')] }),
    stageAll: () => ({ args: ['add', '-A'] }),
    unstage: (input) => ({ args: ['reset', 'HEAD', '--', ...requiredStringArrayField(input, 'paths')] }),
    unstageAll: () => ({ args: ['reset', 'HEAD'] }),
    discard: (input) => ({ args: ['checkout', '--', ...requiredStringArrayField(input, 'paths')] }),
    markResolved: (input) => ({ args: ['add', '--', ...requiredStringArrayField(input, 'paths')] }),
    commit: (input) => ({ args: ['commit', '-m', requiredStringField(input, 'message')] }),
    amendCommit: (input) => ({ args: ['commit', '--amend', '-m', requiredStringField(input, 'message')] }),
    stash: (input) => ({ args: stashArgs(input) }),
    applyStash: (input) => ({ args: ['stash', 'apply', requiredStringField(input, 'stash')] }),
    popStash: (input) => ({ args: ['stash', 'pop', requiredStringField(input, 'stash')] }),
    dropStash: (input) => ({ args: ['stash', 'drop', requiredString(input, 'stash')] }),
    clearStashes: () => ({ args: ['stash', 'clear'] }),
    getStashSummary: (input) => ({ args: ['stash', 'show', '--include-untracked', '--stat', requiredStringField(input, 'stash')] }),
    checkout: (input) => ({ args: ['checkout', requiredStringField(input, 'ref')] }),
    checkoutNewBranch: (input) => ({ args: checkoutNewBranchArgs(input) }),
    restorePaths: (input) => ({ args: restorePathsArgs(input) }),
    restoreStaged: (input) => ({ args: ['restore', '--staged', '--', ...requiredStringArrayField(input, 'paths')] }),
    restoreWorkingTree: (input) => ({ args: ['restore', '--', ...requiredStringArrayField(input, 'paths')] }),
    merge: (input) => ({ args: ['merge', requiredStringField(input, 'ref')] }),
    continueMerge: () => ({ args: ['-c', 'core.editor=true', 'merge', '--continue'] }),
    abortMerge: () => ({ args: ['merge', '--abort'] }),
    quitMerge: () => ({ args: ['merge', '--quit'] }),
    rebase: (input) => ({ args: rebaseArgs(input) }),
    continueRebase: () => ({ args: ['-c', 'core.editor=true', 'rebase', '--continue'] }),
    abortRebase: () => ({ args: ['rebase', '--abort'] }),
    skipRebase: () => ({ args: ['rebase', '--skip'] }),
    quitRebase: () => ({ args: ['rebase', '--quit'] }),
    cherryPick: (input) => ({ args: cherryPickArgs(input) }),
    continueCherryPick: () => ({ args: ['cherry-pick', '--continue'] }),
    abortCherryPick: () => ({ args: ['cherry-pick', '--abort'] }),
    skipCherryPick: () => ({ args: ['cherry-pick', '--skip'] }),
    revertCommit: (input) => ({ args: revertCommitArgs(input) }),
    continueRevert: () => ({ args: ['revert', '--continue'] }),
    abortRevert: () => ({ args: ['revert', '--abort'] }),
    skipRevert: () => ({ args: ['revert', '--skip'] }),
    resetSoft: (input) => ({ args: ['reset', '--soft', requiredString(input, 'ref')] }),
    resetMixed: (input) => ({ args: ['reset', '--mixed', requiredString(input, 'ref')] }),
    resetHard: (input) => ({ args: ['reset', '--hard', requiredString(input, 'ref')] }),
    resetKeep: (input) => ({ args: ['reset', '--keep', requiredString(input, 'ref')] }),
    resetPaths: (input) => ({ args: resetPathsArgs(input) }),
    undoLastCommit: (input) => ({ args: ['reset', `--${requiredStringField(input, 'mode')}`, 'HEAD~1'] }),
    cleanUntracked: (input) => ({ args: cleanArgs('cleanUntracked', input) }),
    cleanIgnored: (input) => ({ args: cleanArgs('cleanIgnored', input) }),
    previewClean: (input) => ({ args: ['clean', '-n', ...cleanPathArgs(input)] }),
    pull: (input) => ({ args: pullArgs(input) }),
    pushRef: (input) => ({ args: ['push', requiredStringField(input, 'remote'), `${stringField(input, 'sourceRef')}:${requiredStringField(input, 'destinationRef')}`] }),
    pushTags: (input) => ({ args: ['push', requiredStringField(input, 'remote'), '--tags'] }),
    forcePushWithLease: (input) => ({ args: ['push', '--force-with-lease', requiredStringField(input, 'remote'), requiredStringField(input, 'branch')] }),
    getMergeBase: (input) => ({ args: ['merge-base', requiredStringField(input, 'leftRef'), requiredStringField(input, 'rightRef')] }),
    getUserName: () => ({ args: ['config', 'user.name'] }),
    addDetachedWorktree: (input) => ({ args: ['worktree', 'add', '--detach', requiredStringField(input, 'path'), requiredStringField(input, 'ref')] }),
    lockWorktree: (input) => ({ args: ['worktree', 'lock', requiredStringField(input, 'worktree')] }),
    unlockWorktree: (input) => ({ args: ['worktree', 'unlock', requiredStringField(input, 'worktree')] }),
    deleteRemoteBranch: (input) => ({ args: ['push', requiredStringField(input, 'remote'), '--delete', requiredStringField(input, 'branch')] }),
};

const CLI_HANDLERS: Partial<Record<SemanticGitOperation, CliSemanticHandler>> = {
    getStatus: async (_input, runProcess, context, signal) => {
        return await queryStatus(readonlyRawExec(runProcess, context), signal);
    },
    getConflictStages: async (input, runProcess, context, signal) => {
        return await readConflictStages(runProcess, context, requiredStringField(input, 'path'), signal);
    },
    listBranches: async (_input, runProcess, context, signal) => {
        const roRaw = readonlyRawExec(runProcess, context);
        return await queryAllBranches(roRaw, (s) => queryCurrentBranch(readonlyTrimmedExec(runProcess, context), s), signal);
    },
    listRemoteBranches: async (_input, runProcess, context, signal) => {
        const roRaw = readonlyRawExec(runProcess, context);
        return (await queryAllBranches(roRaw, (s) => queryCurrentBranch(readonlyTrimmedExec(runProcess, context), s), signal))
            .filter((branch) => branch.isRemote);
    },
    listTags: async (_input, runProcess, context, signal) => {
        return await queryAllTags(readonlyRawExec(runProcess, context), signal);
    },
    listWorktrees: async (_input, runProcess, context, signal) => {
        return await queryWorktrees(readonlyRawExec(runProcess, context), signal);
    },
    addWorktree: async (input, runProcess, context, signal) => {
        await addWorktree(
            trimmedExec(runProcess, context),
            requiredStringField(input, 'path'),
            requiredStringField(input, 'branch'),
            optionalBooleanField(input, 'createNew') ?? false,
            optionalStringField(input, 'startPoint'),
            signal,
        );
    },
    removeWorktree: async (input, runProcess, context, signal) => {
        await removeWorktree(trimmedExec(runProcess, context), requiredStringField(input, 'worktree'), optionalBooleanField(input, 'force') ?? false, signal);
    },
    listSubmodules: async (_input, runProcess, context, signal) => {
        return await querySubmoduleStatus(readonlyRawExec(runProcess, context), signal);
    },
    getSubmoduleStatus: async (input, runProcess, context, signal) => {
        const path = requiredStringField(input, 'path');
        const submodules = await querySubmoduleStatus(readonlyRawExec(runProcess, context), signal);
        const submodule = submodules.find((candidate) => candidate.path === path);
        if (!submodule) {
            throw new Error(`Submodule "${path}" was not found.`);
        }
        return submodule;
    },
    updateSubmodule: async (input, runProcess, context, signal) => {
        await updateSubmodule(trimmedExec(runProcess, context), requiredStringField(input, 'path'), signal);
    },
    initSubmodule: async (input, runProcess, context, signal) => {
        await updateSubmodule(trimmedExec(runProcess, context), requiredStringField(input, 'path'), signal);
    },
    acceptOurs: async (input, runProcess, context, signal) => {
        await acceptConflictSide(trimmedExec(runProcess, context), 'ours', requiredStringArrayField(input, 'paths'), signal);
    },
    acceptTheirs: async (input, runProcess, context, signal) => {
        await acceptConflictSide(trimmedExec(runProcess, context), 'theirs', requiredStringArrayField(input, 'paths'), signal);
    },
    listStashes: async (input, runProcess, context, signal) => {
        const pageRequest = pageRequestFromInput(input);
        const items = await queryStashList(readonlyTrimmedExec(runProcess, context), signal);
        return pageFromOffset(items, pageRequest.limit, decodeOffset(pageRequest.encodedCursor));
    },
    getStashFiles: async (input, runProcess, context, signal) => {
        const output = await readonlyRawExec(runProcess, context)(
            ['stash', 'show', '--include-untracked', '--name-status', '-M', '-z', requiredStringField(input, 'stash')],
            signal,
        );
        return output ? parseNameStatusZ(output) : [];
    },
    getWorkingTreeDiff: async (input, runProcess, context, signal) => {
        return readonlyRawExec(runProcess, context)(['diff', '--binary', '--', ...requiredStringArrayField(input, 'paths')], signal);
    },
    getIndexDiff: async (input, runProcess, context, signal) => {
        return readonlyRawExec(runProcess, context)(['diff', '--cached', '--binary', '--', ...requiredStringArrayField(input, 'paths')], signal);
    },
    getCombinedDiff: async (input, runProcess, context, signal) => {
        return readonlyRawExec(runProcess, context)(['diff', 'HEAD', '--binary', '--', ...requiredStringArrayField(input, 'paths')], signal);
    },
    getPatch: async (input, runProcess, context, signal) => {
        return getPatch(input, runProcess, context, signal);
    },
    push: async (input, runProcess, context, signal) => {
        await push(input, runProcess, context, signal);
    },
    pushBranch: async (input, runProcess, context, signal) => {
        await pushBranch(input, runProcess, context, signal);
    },
    checkPatch: async (input, runProcess, context, signal) => {
        try {
            await applyPatchContent(runProcess, context, requiredStringField(input, 'patch'), patchApplyArgs(input, true), signal);
            return true;
        } catch (error) {
            if (isAbortError(error)) { throw error; }
            return false;
        }
    },
    applyPatch: async (input, runProcess, context, signal) => {
        await applyPatchContent(runProcess, context, requiredStringField(input, 'patch'), patchApplyArgs(input, false), signal);
    },
    applyPatchToIndex: async (input, runProcess, context, signal) => {
        await applyPatchContent(runProcess, context, requiredStringField(input, 'patch'), patchApplyArgs(input, false, true), signal);
    },
    reverseApplyPatch: async (input, runProcess, context, signal) => {
        await applyPatchContent(runProcess, context, requiredStringField(input, 'patch'), [...patchApplyArgs(input, false), '--reverse'], signal);
    },
    getCommitGraph: handleCommitGraph,
    getCommitDetails: async (input, runProcess, context, signal) => {
        const commit = requiredStringField(input, 'commit');
        const commits = await queryCommitLog(readonlyRawExec(runProcess, context), 1, 0, commit, undefined, signal);
        const first = commits[0];
        if (!first) {
            throw new Error(`Commit "${commit}" was not found.`);
        }
        return first;
    },
    getCommitFiles: async (input, runProcess, context, signal) => {
        return await queryCommitFiles(readonlyRawExec(runProcess, context), requiredStringField(input, 'commit'), signal);
    },
    getCommitMessage: async (input, runProcess, context, signal) => {
        return await queryCommitMessage(readonlyTrimmedExec(runProcess, context), requiredStringField(input, 'commit'), signal);
    },
    getCommitPatch: async (input, runProcess, context, signal) => {
        return await readonlyRawExec(runProcess, context)(['show', '--format=', '--patch', requiredStringField(input, 'commit')], signal);
    },
    getCommitFileDiff: async (input, runProcess, context, signal) => {
        return await readonlyRawExec(runProcess, context)(['show', '--format=', '--patch', requiredStringField(input, 'commit'), '--', requiredStringField(input, 'path')], signal);
    },
    getFileHistory: async (input, runProcess, context, signal) => {
        const pageRequest = pageRequestFromInput(input);
        const query = queryFromInput(input);
        const path = requiredStringField(input, 'path');
        const offset = decodeOffset(pageRequest.encodedCursor);
        const ref = query.branches?.[0];
        const commits = await queryCommitLog(
            readonlyRawExec(runProcess, context),
            pageRequest.limit + 1,
            offset,
            ref,
            path,
            signal,
            ['--follow'],
        );
        return pageFromOffset(commits, pageRequest.limit, offset);
    },
    getFileSelectionHistory: async (input, runProcess, context, signal) => {
        const pageRequest = pageRequestFromInput(input);
        const path = requiredStringField(input, 'path');
        const selection = objectField(input, 'selection');
        if (typeof selection !== 'object' || selection === null) {
            throw new Error('selection is required.');
        }
        const startLine = objectField(selection, 'startLine');
        const endLine = objectField(selection, 'endLine');
        if (typeof startLine !== 'number' || typeof endLine !== 'number') {
            throw new Error('selection requires startLine and endLine numbers.');
        }
        const offset = decodeOffset(pageRequest.encodedCursor);
        const commits = await queryCommitLineRangeLog(
            readonlyRawExec(runProcess, context),
            pageRequest.limit + 1,
            offset,
            path,
            startLine,
            endLine,
            signal,
        );
        return pageFromOffset(commits, pageRequest.limit, offset);
    },
    getAheadBehind: async (input, runProcess, context, signal) => {
        const localRef = requiredStringField(input, 'localRef');
        const upstreamRef = requiredStringField(input, 'upstreamRef');
        const output = await readonlyTrimmedExec(runProcess, context)(
            ['rev-list', '--count', '--left-right', `${localRef}...${upstreamRef}`],
            signal,
        );
        const parts = output.split(/\s+/);
        return { ahead: parseInt(parts[0] ?? '0', 10), behind: parseInt(parts[1] ?? '0', 10) };
    },
    getCommitRange: async (input, runProcess, context, signal) => {
        const pageRequest = pageRequestFromInput(input);
        const fromRef = requiredStringField(input, 'fromRef');
        const toRef = requiredStringField(input, 'toRef');
        const offset = decodeOffset(pageRequest.encodedCursor);
        const commits = await queryCommitLog(
            readonlyRawExec(runProcess, context),
            pageRequest.limit + 1,
            offset,
            `${fromRef}..${toRef}`,
            undefined,
            signal,
        );
        return pageFromOffset(commits, pageRequest.limit, offset);
    },
    searchCommits: handleCommitGraph,
    getReachableCommitHashes: async (input, runProcess, context, signal) => {
        const hashes = requiredStringArrayField(input, 'hashes');
        const unique = Array.from(new Set(hashes));
        if (unique.length === 0) { return new Set<string>(); }
        const unreachableRaw = await readonlyRawExec(runProcess, context)(['rev-list', '--no-walk', ...unique, '--not', 'HEAD'], signal);
        const unreachable = new Set(unreachableRaw.split(/\r?\n/).filter(Boolean));
        return new Set(unique.filter((hash) => {
            for (const u of unreachable) {
                if (u === hash || u.startsWith(hash) || hash.startsWith(u)) { return false; }
            }
            return true;
        }));
    },
    orderCommits: async (input, runProcess, context, signal) => {
        const hashes = requiredStringArrayField(input, 'hashes');
        const direction = requiredStringField(input, 'direction');
        const unique = Array.from(new Set(hashes));
        if (unique.length <= 1) { return unique; }
        const selected = new Set(unique);
        const raw = await readonlyTrimmedExec(runProcess, context)(['rev-list', '--topo-order', ...unique], signal);
        const orderedNewestFirst = raw.split(/\s+/).filter((c: string) => selected.has(c));
        const orderedSet = new Set(orderedNewestFirst);
        const ordered = [...orderedNewestFirst, ...unique.filter((c) => !orderedSet.has(c))];
        return direction === 'newestFirst' ? ordered : ordered.slice().reverse();
    },
    getUpstreamBranch: async (input, runProcess, context, signal) => {
        const branch = requiredStringField(input, 'branch');
        try {
            const upstream = await readonlyTrimmedExec(runProcess, context)(
                ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`],
                signal,
            );
            return upstream || undefined;
        } catch {
            return undefined;
        }
    },
    compareRefs: async (input, runProcess, context, signal) => {
        return diffNameStatus(runProcess, context, requiredStringField(input, 'baseRef'), requiredStringField(input, 'headRef'), objectField(input, 'options'), signal);
    },
    compareBranches: async (input, runProcess, context, signal) => {
        return diffNameStatus(runProcess, context, requiredStringField(input, 'baseBranch'), requiredStringField(input, 'headBranch'), objectField(input, 'options'), signal);
    },
    compareWithWorkingTree: async (input, runProcess, context, signal) => {
        const baseRef = requiredStringField(input, 'baseRef');
        const options = objectField(input, 'options');
        const args = ['diff', '--name-status', '-z'];
        if (booleanOption(options, 'includeRenames')) { args.push('-M'); }
        if (booleanOption(options, 'ignoreWhitespace')) { args.push('-w'); }
        args.push(baseRef, '--');
        const output = await readonlyRawExec(runProcess, context)(args, signal);
        return output ? parseNameStatusZ(output) : [];
    },
    listChangedFiles: async (input, runProcess, context, signal) => {
        const baseRef = requiredStringField(input, 'baseRef');
        const headRef = requiredStringField(input, 'headRef');
        const pageRequest = pageRequestFromInput(input);
        const offset = decodeOffset(pageRequest.encodedCursor);
        const args = ['diff', '--name-status', '-z', baseRef, headRef, '--'];
        const output = await readonlyRawExec(runProcess, context)(args, signal);
        const allChanges = output ? parseNameStatusZ(output) : [];
        return pageFromOffset(allChanges.slice(offset), pageRequest.limit, offset);
    },
    rewordCommit: async (input, runProcess, context, signal) => {
        await rewordCommit(runProcess, context, requiredStringField(input, 'commit'), requiredStringField(input, 'message'), signal);
    },
    squashCommits: async (input, runProcess, context, signal) => {
        await squashCommits(runProcess, context, requiredStringArrayField(input, 'commits'), requiredStringField(input, 'message'), signal);
    },
    fixupCommits: async (input, runProcess, context, signal) => {
        await fixupCommits(runProcess, context, requiredStringArrayField(input, 'commits'), signal);
    },
    dropCommit: async (input, runProcess, context, signal) => {
        await dropCommit(runProcess, context, requiredStringField(input, 'commit'), signal);
    },
};

async function rewordCommit(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commit: string,
    message: string,
    signal?: AbortSignal,
): Promise<void> {
    const parents = await parentHashes(runProcess, context, commit, signal);
    if (parents.length > 1) { throw new Error('Editing merge commit messages is not supported yet.'); }
    const currentBranchName = await readCurrentBranch(runProcess, context, signal);
    const branches = await localBranchesContaining(runProcess, context, commit, signal);
    const head = await runTrimmed(runProcess, context, ['rev-parse', 'HEAD'], signal);
    if (branches.length === 0 && head !== commit) {
        throw new Error('Edit Commit Message requires a local branch that contains the selected commit.');
    }

    const rewritten = await createCommitWithMessage(runProcess, context, commit, parents[0], commit, message, signal);
    if (branches.length === 0) {
        await runTrimmed(runProcess, context, ['reset', '--soft', rewritten], signal);
        return;
    }

    try {
        for (const branch of orderBranchesForRewrite(branches, currentBranchName)) {
            await replaceCommitOnBranch(runProcess, context, branch, commit, rewritten, parents[0], signal);
        }
    } finally {
        await restoreCurrentBranch(runProcess, context, currentBranchName, signal);
    }
}

async function squashCommits(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commits: readonly string[],
    message: string,
    signal?: AbortSignal,
): Promise<void> {
    if (commits.length < 2) { throw new Error('Select at least two commits to squash.'); }
    const range = await validateSquashCommitRange(runProcess, context, commits, signal);
    const rewritten = await createCommitWithMessage(runProcess, context, commits[0]!, range.parentHash, range.newestHash, message, signal);
    await replaceCommitRangeWithCommit(runProcess, context, range.newestHash, rewritten, signal);
}

async function fixupCommits(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commits: readonly string[],
    signal?: AbortSignal,
): Promise<void> {
    const target = commits[0];
    if (!target) { throw new Error('A target commit is required.'); }
    const stagedFiles = await runRaw(runProcess, context, ['diff', '--cached', '--name-only'], signal);
    if (!stagedFiles.trim()) { throw new Error('Stage changes before using Fixup.'); }
    const dirtyUnstaged = await runRaw(runProcess, context, ['diff', '--name-only'], signal);
    if (dirtyUnstaged.trim()) { throw new Error('Fixup requires a clean unstaged working tree.'); }
    const parents = await parentHashes(runProcess, context, target, signal);
    if (parents.length > 1) { throw new Error('Fixup is not supported for merge commits.'); }

    await runTrimmed(runProcess, context, ['commit', '--fixup', target, '--no-edit'], signal);

    const branch = await readCurrentBranch(runProcess, context, signal);
    const rebaseArgs = parents[0]
        ? ['rebase', '--autosquash', '--autostash', parents[0], branch]
        : ['rebase', '--autosquash', '--autostash', '--root', branch];
    await runTrimmed(runProcess, context, rebaseArgs, signal, { GIT_SEQUENCE_EDITOR: 'true', GIT_EDITOR: 'true' });
}

async function dropCommit(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commit: string,
    signal?: AbortSignal,
): Promise<void> {
    await runTrimmed(runProcess, context, ['rebase', '--autostash', '--onto', `${commit}^`, commit], signal);
}

async function createCommitWithMessage(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    authorCommit: string,
    parentHash: string | undefined,
    treeCommit: string,
    message: string,
    signal?: AbortSignal,
): Promise<string> {
    const [authorName, authorEmail, authorDate] = (await runRaw(runProcess, context, ['show', '-s', '--format=%an%x00%ae%x00%aI', authorCommit], signal)).split('\0');
    if (!authorName || !authorEmail || !authorDate) { throw new Error('Could not read commit author metadata.'); }
    const tree = await runTrimmed(runProcess, context, ['show', '-s', '--format=%T', treeCommit], signal);
    const parentArgs = parentHash ? ['-p', parentHash] : [];
    return runTrimmed(
        runProcess,
        context,
        ['commit-tree', tree, ...parentArgs, '-m', message],
        signal,
        {
            GIT_AUTHOR_NAME: authorName,
            GIT_AUTHOR_EMAIL: authorEmail,
            GIT_AUTHOR_DATE: authorDate.trim(),
        },
    );
}

async function parentHashes(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commit: string,
    signal?: AbortSignal,
): Promise<readonly string[]> {
    return (await runTrimmed(runProcess, context, ['show', '-s', '--format=%P', commit], signal)).split(/\s+/).filter(Boolean);
}

async function localBranchesContaining(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commit: string,
    signal?: AbortSignal,
): Promise<readonly string[]> {
    const output = await runRaw(runProcess, context, ['for-each-ref', '--format=%(refname:short)', '--contains', commit, 'refs/heads'], signal);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function readCurrentBranch(runProcess: CliGitRuntimeProcess, context: GitExecutionContext, signal?: AbortSignal): Promise<string> {
    return runTrimmed(runProcess, context, ['rev-parse', '--abbrev-ref', 'HEAD'], signal);
}

function orderBranchesForRewrite(branches: readonly string[], currentBranchName: string): readonly string[] {
    if (currentBranchName === 'HEAD' || !branches.includes(currentBranchName)) { return branches; }
    return [...branches.filter((branch) => branch !== currentBranchName), currentBranchName];
}

async function replaceCommitOnBranch(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    branch: string,
    commit: string,
    rewritten: string,
    parentHash: string | undefined,
    signal?: AbortSignal,
): Promise<void> {
    const branchTip = await runTrimmed(runProcess, context, ['rev-parse', branch], signal);
    const branchNow = await readCurrentBranch(runProcess, context, signal);
    if (branchTip === commit) {
        if (branch === branchNow) {
            await runTrimmed(runProcess, context, ['reset', '--soft', rewritten], signal);
        } else {
            await runTrimmed(runProcess, context, ['update-ref', `refs/heads/${branch}`, rewritten, commit], signal);
        }
        return;
    }
    const args = parentHash
        ? ['rebase', '--autostash', '--onto', rewritten, commit, branch]
        : ['rebase', '--autostash', '--onto', rewritten, '--root', branch];
    await runTrimmed(runProcess, context, args, signal);
}

interface SquashCommitRange {
    readonly parentHash: string | undefined;
    readonly newestHash: string;
}

async function validateSquashCommitRange(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    commits: readonly string[],
    signal?: AbortSignal,
): Promise<SquashCommitRange> {
    let previousHash: string | undefined;
    let parentHash: string | undefined;
    for (const [index, commit] of commits.entries()) {
        const parents = await parentHashes(runProcess, context, commit, signal);
        if (parents.length > 1) { throw new Error('Squash Commits is not supported for merge commits.'); }
        if (index === 0) {
            parentHash = parents[0];
        } else if (parents[0] !== previousHash) {
            throw new Error('Squash Commits requires a contiguous linear commit selection.');
        }
        previousHash = commit;
    }
    const newestHash = commits.at(-1);
    if (!newestHash) { throw new Error('Select at least two commits to squash.'); }
    return { parentHash, newestHash };
}

async function replaceCommitRangeWithCommit(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    newestHash: string,
    rewritten: string,
    signal?: AbortSignal,
): Promise<void> {
    const currentBranchName = await readCurrentBranch(runProcess, context, signal);
    const branches = await localBranchesContaining(runProcess, context, newestHash, signal);
    const head = await runTrimmed(runProcess, context, ['rev-parse', 'HEAD'], signal);
    if (branches.length === 0 && head !== newestHash) {
        throw new Error('Squash Commits requires a local branch that contains the selected commits.');
    }
    if (branches.length === 0) {
        await runTrimmed(runProcess, context, ['reset', '--soft', rewritten], signal);
        return;
    }

    try {
        for (const branch of orderBranchesForRewrite(branches, currentBranchName)) {
            await replaceCommitRangeOnBranch(runProcess, context, branch, newestHash, rewritten, signal);
        }
    } finally {
        await restoreCurrentBranch(runProcess, context, currentBranchName, signal);
    }
}

async function replaceCommitRangeOnBranch(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    branch: string,
    newestHash: string,
    rewritten: string,
    signal?: AbortSignal,
): Promise<void> {
    const branchTip = await runTrimmed(runProcess, context, ['rev-parse', branch], signal);
    const branchNow = await readCurrentBranch(runProcess, context, signal);
    if (branchTip === newestHash) {
        if (branch === branchNow) {
            await runTrimmed(runProcess, context, ['reset', '--soft', rewritten], signal);
        } else {
            await runTrimmed(runProcess, context, ['update-ref', `refs/heads/${branch}`, rewritten, newestHash], signal);
        }
        return;
    }
    await runTrimmed(runProcess, context, ['rebase', '--autostash', '--onto', rewritten, newestHash, branch], signal);
}

async function restoreCurrentBranch(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    originalBranch: string,
    signal?: AbortSignal,
): Promise<void> {
    if (originalBranch !== 'HEAD' && await readCurrentBranch(runProcess, context, signal).catch(() => 'HEAD') !== originalBranch) {
        await runTrimmed(runProcess, context, ['checkout', originalBranch], signal);
    }
}

async function acceptConflictSide(
    exec: GitExec,
    side: 'ours' | 'theirs',
    paths: readonly string[],
    signal?: AbortSignal,
): Promise<void> {
    if (paths.length === 0) { return; }
    await exec(['checkout', `--${side}`, '--', ...paths], signal);
    await exec(['add', '--', ...paths], signal);
}

enum ConflictStage {
    Base = 1,
    Ours = 2,
    Theirs = 3,
}

async function readConflictStages(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    filePath: string,
    signal?: AbortSignal,
): Promise<{ readonly base: string; readonly ours: string; readonly theirs: string }> {
    const hashes = await readConflictStageHashes(runProcess, context, filePath, signal);
    const [base, ours, theirs] = await Promise.all([
        readObject(runProcess, context, hashes.get(ConflictStage.Base), signal),
        readObject(runProcess, context, hashes.get(ConflictStage.Ours), signal),
        readObject(runProcess, context, hashes.get(ConflictStage.Theirs), signal),
    ]);
    return { base, ours, theirs };
}

async function readConflictStageHashes(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    filePath: string,
    signal?: AbortSignal,
): Promise<ReadonlyMap<ConflictStage, string>> {
    const raw = await runRaw(runProcess, context, ['ls-files', '-u', '-z', '--', filePath], signal);
    const hashes = new Map<ConflictStage, string>();
    for (const entry of raw.split('\0')) {
        if (!entry) { continue; }
        const match = entry.match(/^\d+\s+([0-9a-fA-F]+)\s+([123])\t/);
        if (!match?.[1] || !match[2]) { continue; }
        hashes.set(Number(match[2]) as ConflictStage, match[1]);
    }
    return hashes;
}

async function readObject(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    hash: string | undefined,
    signal?: AbortSignal,
): Promise<string> {
    return hash ? runRaw(runProcess, context, ['cat-file', '-p', hash], signal) : '';
}

async function handleCommitGraph(
    input: unknown,
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<unknown> {
    const pageRequest = pageRequestFromInput(input);
    const query = queryFromInput(input);
    const offset = decodeOffset(pageRequest.encodedCursor);
    const commits = await queryGraphLog(
        readonlyRawExec(runProcess, context),
        pageRequest.limit + 1,
        query.branches,
        query.path,
        {
            search: query.search,
            authors: query.authors,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            skip: offset,
        },
        signal,
    );
    return pageFromOffset(commits, pageRequest.limit, offset);
}

async function diffNameStatus(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    baseRef: string,
    headRef: string,
    options: unknown,
    signal?: AbortSignal,
) {
    const args = ['diff', '--name-status', '-z'];
    if (booleanOption(options, 'includeRenames')) { args.push('-M'); }
    if (booleanOption(options, 'ignoreWhitespace')) { args.push('-w'); }
    args.push(baseRef, headRef, '--');
    const output = await readonlyRawExec(runProcess, context)(args, signal);
    return output ? parseNameStatusZ(output) : [];
}

async function getPatch(
    input: unknown,
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<string> {
    const scope = requiredStringField(input, 'scope');
    const paths = requiredStringArrayField(input, 'paths');
    switch (scope) {
        case 'index':
        case 'staged':
            return readonlyRawExec(runProcess, context)(['diff', '--cached', '--binary', '--', ...paths], signal);
        case 'workingTree':
        case 'unstaged':
            return readonlyRawExec(runProcess, context)(['diff', '--binary', '--', ...paths], signal);
        case 'combined':
            return readonlyRawExec(runProcess, context)(['diff', 'HEAD', '--binary', '--', ...paths], signal);
        case 'untracked':
            return diffUntrackedFile(runProcess, context, singlePath(paths, 'untracked patch'), signal);
        default:
            throw new Error(`Unsupported patch scope "${scope}".`);
    }
}

async function diffUntrackedFile(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    filePath: string,
    signal?: AbortSignal,
): Promise<string> {
    try {
        return await runRaw(runProcess, context, ['diff', '--binary', '--no-index', '--', '/dev/null', filePath], signal);
    } catch (error) {
        const stdout = stdoutFromExecError(error);
        if (stdout !== undefined) { return stdout; }
        throw error;
    }
}

async function applyPatchContent(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    patch: string,
    args: readonly string[],
    signal?: AbortSignal,
): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-apply-patch-'));
    const filePath = path.join(dir, 'patch.diff');
    try {
        await fs.writeFile(filePath, patch, 'utf8');
        await runTrimmed(runProcess, context, [...args, filePath], signal);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

function patchApplyArgs(input: unknown, check: boolean, index = false): readonly string[] {
    const options = objectField(input, 'options');
    return [
        'apply',
        ...(check ? ['--check'] : []),
        ...(booleanOption(options, 'threeWay') ? ['--3way'] : []),
        ...(booleanOption(options, 'reject') ? ['--reject'] : []),
        ...(index ? ['--index'] : []),
    ];
}

function singlePath(paths: readonly string[], label: string): string {
    const [filePath, ...rest] = paths;
    if (!filePath || rest.length > 0) { throw new Error(`Exactly one path is required for ${label}.`); }
    return filePath;
}

function resultFor(operation: SemanticGitOperation, output: string): unknown {
    switch (operation) {
        case 'listRemotes':
            return output ? output.split('\n').filter(Boolean) : [];
        case 'previewClean':
            return output ? output.split('\n').map(cleanPreviewPath).filter(Boolean) : [];
        default:
            return output;
    }
}

function requiredString(input: unknown, label: string): string {
    if (typeof input === 'string' && input) { return input; }
    throw new Error(`${label} is required.`);
}

function requiredStringField(input: unknown, field: string): string {
    const value = objectField(input, field);
    if (typeof value === 'string' && value) { return value; }
    throw new Error(`${field} is required.`);
}

function optionalStringField(input: unknown, field: string): string | undefined {
    const value = objectField(input, field);
    if (value === undefined) { return undefined; }
    if (typeof value === 'string') { return value; }
    throw new Error(`${field} must be a string.`);
}

function stringField(input: unknown, field: string): string {
    const value = objectField(input, field);
    if (typeof value === 'string') { return value; }
    throw new Error(`${field} must be a string.`);
}

function optionalBooleanField(input: unknown, field: string): boolean | undefined {
    const value = objectField(input, field);
    if (value === undefined) { return undefined; }
    if (typeof value === 'boolean') { return value; }
    throw new Error(`${field} must be a boolean.`);
}

function requiredStringArrayField(input: unknown, field: string): readonly string[] {
    const value = objectField(input, field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) { return value; }
    throw new Error(`${field} must be a string array.`);
}

function optionalStringArrayField(input: unknown, field: string): readonly string[] {
    const value = objectField(input, field);
    if (value === undefined) { return []; }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) { return value; }
    throw new Error(`${field} must be a string array.`);
}

function objectField(input: unknown, field: string): unknown {
    if (typeof input !== 'object' || input === null) { return undefined; }
    return (input as Readonly<Record<string, unknown>>)[field];
}

function stdoutFromExecError(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('stdout' in error)) { return undefined; }
    const stdout = (error as { readonly stdout?: unknown }).stdout;
    return typeof stdout === 'string' ? stdout : undefined;
}

function isAbortError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'name' in error
        && (error as { readonly name?: unknown }).name === 'AbortError';
}

async function runRaw(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    args: readonly string[],
    signal?: AbortSignal,
    env?: Readonly<Record<string, string>>,
): Promise<string> {
    return runProcess(args, context, { signal, env });
}

async function runTrimmed(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    args: readonly string[],
    signal?: AbortSignal,
    env?: Readonly<Record<string, string>>,
): Promise<string> {
    return (await runRaw(runProcess, context, args, signal, env)).trim();
}

function createBranchArgs(input: unknown): readonly string[] {
    const name = requiredStringField(input, 'name');
    const startPoint = optionalStringField(input, 'startPoint');
    return startPoint ? ['branch', name, startPoint] : ['branch', name];
}

function deleteBranchArgs(input: unknown): readonly string[] {
    const flag = optionalBooleanField(input, 'force') ? '-D' : '-d';
    return ['branch', flag, requiredStringField(input, 'name')];
}

function createTagArgs(input: unknown): readonly string[] {
    const name = requiredStringField(input, 'name');
    const target = requiredStringField(input, 'target');
    const message = optionalStringField(input, 'message');
    return message ? ['tag', '-a', name, target, '-m', message] : ['tag', name, target];
}

function withOptionalRemote(args: readonly string[], remote: string | undefined): readonly string[] {
    return remote ? [...args, remote] : args;
}

function withOptionalMessage(args: readonly string[], message: string | undefined): readonly string[] {
    return message ? [...args, '-m', message] : args;
}

function stashArgs(input: unknown): readonly string[] {
    const message = optionalStringField(input, 'message');
    const options = objectField(input, 'options');
    const args = ['stash', 'push'];
    if (booleanOption(options, 'includeUntracked')) { args.push('--include-untracked'); }
    if (booleanOption(options, 'keepIndex')) { args.push('--keep-index'); }
    if (booleanOption(options, 'staged')) { args.push('--staged'); }
    const messageArgs = withOptionalMessage(args, message);
    const paths = optionalStringArrayField(options, 'paths');
    return paths.length > 0 ? [...messageArgs, '--', ...paths] : messageArgs;
}

function booleanOption(input: unknown, field: string): boolean {
    if (input === undefined) { return false; }
    if (typeof input !== 'object' || input === null) {
        throw new Error('options must be an object.');
    }
    const value = objectField(input, field);
    if (value === undefined) { return false; }
    if (typeof value === 'boolean') { return value; }
    throw new Error(`options.${field} must be a boolean.`);
}

function checkoutNewBranchArgs(input: unknown): readonly string[] {
    const branch = requiredStringField(input, 'name');
    const startPoint = optionalStringField(input, 'startPoint');
    return startPoint ? ['checkout', '-b', branch, startPoint] : ['checkout', '-b', branch];
}

function restorePathsArgs(input: unknown): readonly string[] {
    const paths = requiredStringArrayField(input, 'paths');
    const sourceRef = optionalStringField(input, 'sourceRef');
    return sourceRef ? ['restore', '--source', sourceRef, '--', ...paths] : ['restore', '--', ...paths];
}

function rebaseArgs(input: unknown): readonly string[] {
    const upstream = requiredStringField(input, 'upstream');
    const branch = optionalStringField(input, 'branch');
    return branch ? ['rebase', upstream, branch] : ['rebase', upstream];
}

function cherryPickArgs(input: unknown): readonly string[] {
    const args = ['cherry-pick'];
    const options = objectField(input, 'options');
    if (booleanOption(options, 'noCommit')) { args.push('--no-commit'); }
    args.push(requiredStringField(input, 'commit'));
    return args;
}

function revertCommitArgs(input: unknown): readonly string[] {
    const args = ['revert'];
    const options = objectField(input, 'options');
    if (booleanOption(options, 'noCommit')) { args.push('--no-commit'); }
    if (booleanOption(options, 'noEdit')) { args.push('--no-edit'); }
    args.push(requiredStringField(input, 'commit'));
    return args;
}

function resetPathsArgs(input: unknown): readonly string[] {
    const paths = requiredStringArrayField(input, 'paths');
    const sourceRef = optionalStringField(input, 'sourceRef');
    return sourceRef ? ['reset', sourceRef, '--', ...paths] : ['reset', '--', ...paths];
}

function pullArgs(input: unknown): readonly string[] {
    const options = objectField(input, 'options');
    return booleanOption(options, 'rebase') ? ['pull', '--rebase'] : ['pull'];
}

async function push(
    input: unknown,
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<void> {
    const options = objectField(input, 'options');
    const requestedRemote = optionalStringField(input, 'remote');
    if (requestedRemote) {
        await runProcess(pushArgs(requestedRemote, options), context, { signal });
        return;
    }

    const branch = await resolveCurrentBranch(runProcess, context, signal);
    if (!branch) {
        await runProcess(pushArgs(undefined, options), context, { signal });
        return;
    }

    const upstream = await resolveBranchUpstream(runProcess, context, branch, signal);
    if (upstream) {
        await runProcess(pushArgs(undefined, options), context, { signal });
        return;
    }

    await runProcess(pushBranchArgs(await defaultRemote(runProcess, context, signal), branch, options, true), context, { signal });
}

function pushArgs(remote: string | undefined, options: unknown): readonly string[] {
    const args = withOptionalRemote(['push'], remote);
    return booleanOption(options, 'forceWithLease') ? [...args, '--force-with-lease'] : args;
}

async function pushBranch(
    input: unknown,
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<void> {
    const branch = requiredStringField(input, 'branch');
    const options = objectField(input, 'options');
    const requestedRemote = optionalStringField(input, 'remote');
    const upstream = await resolveBranchUpstream(runProcess, context, branch, signal);
    const remote = requestedRemote ?? (upstream ? requireRemoteBranchName(upstream).remote : await defaultRemote(runProcess, context, signal));
    await runProcess(pushBranchArgs(remote, branch, options, requestedRemote === undefined && upstream === undefined), context, { signal });
}

function pushBranchArgs(remote: string, branch: string, options: unknown, setUpstreamByDefault: boolean): readonly string[] {
    const args = ['push'];
    if (optionalBooleanField(options, 'setUpstream') ?? setUpstreamByDefault) { args.push('-u'); }
    if (booleanOption(options, 'forceWithLease')) { args.push('--force-with-lease'); }
    args.push(remote, branch);
    return args;
}

async function resolveBranchUpstream(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    branch: string,
    signal?: AbortSignal,
): Promise<string | undefined> {
    try {
        return (await runProcess(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], context, { signal })).trim();
    } catch (error) {
        if (isAbortError(error)) { throw error; }
        return undefined;
    }
}

async function resolveCurrentBranch(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<string | undefined> {
    try {
        const branch = (await runProcess(['rev-parse', '--abbrev-ref', 'HEAD'], context, { signal })).trim();
        return branch && branch !== 'HEAD' ? branch : undefined;
    } catch (error) {
        if (isAbortError(error)) { throw error; }
        return undefined;
    }
}

async function defaultRemote(
    runProcess: CliGitRuntimeProcess,
    context: GitExecutionContext,
    signal?: AbortSignal,
): Promise<string> {
    const remote = (await runProcess(['remote'], context, { signal }))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (!remote) { throw new Error('No Git remote configured.'); }
    return remote;
}

function cleanArgs(operation: 'cleanUntracked' | 'cleanIgnored', input: unknown): readonly string[] {
    const modeArgs = operation === 'cleanIgnored' ? ['-f', '-X'] : ['-f'];
    return ['clean', ...modeArgs, ...cleanPathArgs(input)];
}

function cleanPathArgs(input: unknown): readonly string[] {
    const paths = objectField(input, 'paths');
    if (paths === undefined) { return []; }
    if (Array.isArray(paths) && paths.every((item) => typeof item === 'string')) {
        return paths.length > 0 ? ['--', ...paths] : [];
    }
    throw new Error('paths must be a string array.');
}

function cleanPreviewPath(line: string): string {
    return line.replace(/^Would remove /, '').trim();
}

function readonlyRawExec(runProcess: CliGitRuntimeProcess, context: GitExecutionContext): GitExec {
    return async (args, signal) => await runProcess(args, context, { signal });
}

function readonlyTrimmedExec(runProcess: CliGitRuntimeProcess, context: GitExecutionContext): GitExec {
    return async (args, signal) => (await runProcess(args, context, { signal })).trim();
}

function trimmedExec(runProcess: CliGitRuntimeProcess, context: GitExecutionContext): GitExec {
    return async (args, signal) => (await runProcess(args, context, { signal })).trim();
}

function pageRequestFromInput(input: unknown): { readonly limit: number; readonly encodedCursor?: string } {
    const pageRequest = objectField(input, 'pageRequest');
    if (typeof pageRequest !== 'object' || pageRequest === null) {
        throw new Error('pageRequest is required.');
    }
    const limit = objectField(pageRequest, 'limit');
    const encodedCursor = objectField(pageRequest, 'encodedCursor');
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        throw new Error('pageRequest.limit must be a positive integer.');
    }
    if (encodedCursor !== undefined && typeof encodedCursor !== 'string') {
        throw new Error('pageRequest.encodedCursor must be a string.');
    }
    return { limit, encodedCursor };
}

function queryFromInput(input: unknown): CommitGraphQuery {
    const query = objectField(input, 'query');
    if (query === undefined) { return {}; }
    if (typeof query !== 'object' || query === null) {
        throw new Error('query must be an object.');
    }
    return query as CommitGraphQuery;
}

function decodeOffset(encodedCursor: string | undefined): number {
    if (!encodedCursor) { return 0; }
    const offset = Number.parseInt(encodedCursor, 10);
    if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('encodedCursor must be a non-negative offset.');
    }
    return offset;
}

function pageFromOffset<T>(items: readonly T[], limit: number, offset: number): Page<T> {
    const pageItems = items.slice(0, limit);
    const hasMore = items.length > limit;
    return new Page(pageItems, hasMore, hasMore ? String(offset + limit) : undefined);
}
