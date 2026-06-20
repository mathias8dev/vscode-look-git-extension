import { execFile } from 'child_process';
import { promisify } from 'util';
import { Page } from '../../core/git/domain/Page';
import type { GitExec } from '../../core/git/git-exec';
import { queryAllBranches, queryAllTags, queryCommitFiles, queryCommitLog, queryCommitMessage, queryCurrentBranch, queryGraphLog } from '../../core/queries/queryGraph';
import { queryStatus, queryStashList } from '../../core/queries/queryStatus';
import { parseNameStatusZ } from '../../core/parsing/parseNameStatus';
import { querySubmoduleStatus, updateSubmodule } from '../../core/queries/querySubmodules';
import { addWorktree, queryWorktrees, removeWorktree } from '../../core/queries/queryWorktrees';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '../../application/ports/git-runtime';
import type { SemanticGitOperation } from '../../application/ports/git-operation';
import type { CommitGraphQuery } from '../../application/ports/git-capabilities';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_MAX_LOCK_RETRIES = 5;

interface CliInvocation {
    readonly args: readonly string[];
    readonly trim?: boolean;
}

export interface CliGitRuntimeProcessOptions {
    readonly signal?: AbortSignal;
}

export type CliGitRuntimeProcess = (
    args: readonly string[],
    context: GitExecutionContext,
    options: CliGitRuntimeProcessOptions,
) => Promise<string>;

export class CliGitRuntime implements GitRuntime {
    constructor(
        private readonly runProcess: CliGitRuntimeProcess = defaultRunProcess,
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
    getStashSummary: (input) => ({ args: ['stash', 'show', '--stat', requiredStringField(input, 'stash')] }),
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
    resetPaths: (input) => ({ args: resetPathsArgs(input) }),
    undoLastCommit: (input) => ({ args: ['reset', `--${requiredStringField(input, 'mode')}`, 'HEAD~1'] }),
    cleanUntracked: (input) => ({ args: cleanArgs('cleanUntracked', input) }),
    cleanIgnored: (input) => ({ args: cleanArgs('cleanIgnored', input) }),
    previewClean: (input) => ({ args: ['clean', '-n', ...cleanPathArgs(input)] }),
    pull: () => ({ args: ['pull'] }),
    push: (input) => ({ args: withOptionalRemote(['push'], optionalStringField(input, 'remote')) }),
    pushBranch: (input) => ({ args: ['push', requiredStringField(input, 'remote'), requiredStringField(input, 'branch')] }),
    pushTags: (input) => ({ args: ['push', requiredString(input, 'remote'), '--tags'] }),
    forcePushWithLease: (input) => ({ args: ['push', '--force-with-lease', requiredStringField(input, 'remote'), requiredStringField(input, 'branch')] }),
};

const CLI_HANDLERS: Partial<Record<SemanticGitOperation, CliSemanticHandler>> = {
    getStatus: async (_input, runProcess, context, signal) => {
        return await queryStatus(readonlyRawExec(runProcess, context), signal);
    },
    listBranches: async (_input, runProcess, context, signal) => {
        const roRaw = readonlyRawExec(runProcess, context);
        return await queryAllBranches(roRaw, (s) => queryCurrentBranch(readonlyTrimmedExec(runProcess, context), s), signal);
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
    getCommitGraph: async (input, runProcess, context, signal) => {
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
    },
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
};

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

async function defaultRunProcess(
    args: readonly string[],
    context: GitExecutionContext,
    options: CliGitRuntimeProcessOptions,
): Promise<string> {
    let delayMs = 80;
    for (let attempt = 0; ; attempt++) {
        options.signal?.throwIfAborted();
        try {
            const { stdout } = await execFileAsync('git', [...args], {
                cwd: context.cwd,
                maxBuffer: DEFAULT_MAX_BUFFER,
                env: process.env,
                signal: options.signal,
            });
            return stdout;
        } catch (error) {
            if (attempt >= DEFAULT_MAX_LOCK_RETRIES || !isIndexLockError(error)) { throw error; }
            await sleep(delayMs);
            delayMs *= 2;
        }
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

function isIndexLockError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr = typeof error === 'object' && error !== null
        && typeof (error as { stderr?: unknown }).stderr === 'string'
        ? (error as { stderr: string }).stderr : '';
    const combined = `${msg}\n${stderr}`;
    return combined.includes('index.lock')
        || (combined.includes('Unable to create') && combined.includes('File exists'));
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
